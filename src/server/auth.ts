import { Context, Effect, Layer, Redacted, Schema } from "effect";
import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import { admin, organization } from "better-auth/plugins";
import { AppConfig } from "./config";
import { DatabasePool } from "./database";
import { AppError, AuthenticationError } from "./errors";
import { defaultTeamId, ensureDefaultTeam } from "./actions/default-team";
import { isEligibleTeamInviter } from "./actions/team-inviter";
import { EmailDelivery } from "./services/email";
import { annotateAuthenticatedUser, logOperationalError, telemetryError } from "./observability";

function emailCall(work: () => void | Promise<void>) {
  return Promise.resolve()
    .then(work)
    .catch((error: unknown) => {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: Schema.is(AppError)(error)
          ? error.message
          : "Email delivery is unavailable. Try again later.",
      });
    });
}

function bodyField(body: unknown, field: string): unknown {
  return body && typeof body === "object" ? Reflect.get(body, field) : undefined;
}

function makeAuth(config: AppConfig["Service"], pool: Pool, email: EmailDelivery["Service"]) {
  return betterAuth({
    appName: "Chronicon",
    logger: { disabled: true },
    baseURL: config.baseUrl,
    secret: Redacted.value(config.authSecret) || undefined,
    database: pool,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: ({ user, url }) =>
        emailCall(() => email.sendVerification({ email: user.email, url })),
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" },
    databaseHooks: {
      user: {
        create: {
          after: (user) => ensureDefaultTeam(pool, user).then(() => undefined),
        },
      },
      session: {
        create: {
          before: (session) =>
            Promise.resolve({
              data: { ...session, activeOrganizationId: defaultTeamId(session.userId) },
            }),
        },
      },
    },
    hooks: {
      after: createAuthMiddleware((context) => {
        const session = context.context.newSession ?? context.context.session;
        if (session) {
          const organizationId: unknown = session.session.activeOrganizationId;
          annotateAuthenticatedUser(
            session.user.id,
            typeof organizationId === "string" ? organizationId : undefined,
          );
        }
        return Promise.resolve();
      }),
      before: createAuthMiddleware((context) => {
        if (context.path === "/organization/update-member-role") {
          return getSessionFromCtx(context).then((session) => {
            if (!session?.user.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "Verify your email before changing team access.",
              });
          });
        }
        if (context.path === "/organization/invite-member") {
          return getSessionFromCtx(context).then((session) => {
            if (!session?.user.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "Verify your email before inviting people to your team.",
              });
            const role = bodyField(context.body, "role");
            if (role !== "member" && role !== "admin")
              throw new APIError("BAD_REQUEST", { message: "Choose a member or admin team role." });
            return emailCall(email.requireConfigured);
          });
        }
        if (context.path === "/organization/leave") {
          return getSessionFromCtx(context).then((session) => {
            if (
              session &&
              bodyField(context.body, "organizationId") === defaultTeamId(session.user.id)
            )
              throw new APIError("FORBIDDEN", { message: "You cannot leave your default team." });
          });
        }
        return Promise.resolve();
      }),
    },
    plugins: [
      admin({ defaultRole: "user" }),
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        organizationHooks: {
          beforeAcceptInvitation: ({ invitation }) =>
            isEligibleTeamInviter(pool, invitation).then((eligible) => {
              if (!eligible)
                throw new APIError("FORBIDDEN", {
                  message:
                    "This invitation is no longer available. Ask a team admin to invite you again.",
                });
            }),
          beforeCreateInvitation: ({ inviter, invitation }) => {
            if (!inviter.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "Verify your email before inviting people to your team.",
              });
            if (!["member", "admin"].includes(invitation.role))
              throw new APIError("BAD_REQUEST", { message: "Choose a member or admin team role." });
            return Promise.resolve();
          },
          beforeAddMember: ({ user, member }) => {
            if (!user.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "Members must verify their email before joining a team.",
              });
            if (!["member", "admin"].includes(member.role))
              throw new APIError("FORBIDDEN", { message: "Choose a member or admin team role." });
            return Promise.resolve();
          },
          beforeRemoveMember: ({ member, organization: team }) => {
            if (team.id === defaultTeamId(member.userId))
              throw new APIError("FORBIDDEN", {
                message: "The default team owner cannot be removed.",
              });
            return Promise.resolve();
          },
          beforeUpdateMemberRole: ({ member, newRole, organization: team }) => {
            if (team.id === defaultTeamId(member.userId) || !["member", "admin"].includes(newRole))
              throw new APIError("FORBIDDEN", {
                message: "The default team owner cannot be changed.",
              });
            return Promise.resolve();
          },
        },
        sendInvitationEmail: (invitation) =>
          emailCall(() =>
            email.sendTeamInvitation({
              email: invitation.email,
              inviterName: invitation.inviter.user.name,
              teamName: invitation.organization.name,
              url: new URL(
                `/invitations/${encodeURIComponent(invitation.id)}?type=team`,
                config.baseUrl,
              ).href,
            }),
          ),
      }),
      apiKey({
        defaultPrefix: "chronicon_",
        enableMetadata: true,
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
        permissions: { defaultPermissions: { documents: ["read"] } },
      }),
    ],
  });
}
export const authCall = <A>(work: () => Promise<A>) =>
  Effect.tryPromise({
    try: work,
    catch: (error) => {
      if (Schema.is(AppError)(error)) return error;
      if (error instanceof APIError)
        return new AppError({
          status: error.statusCode,
          message:
            error.statusCode < 500 ? error.message : "Authentication is unavailable. Try again.",
        });
      const details = error && typeof error === "object" ? error : {};
      const rawMessage: unknown = Reflect.get(details, "message");
      const message = typeof rawMessage === "string" ? rawMessage : "";
      logOperationalError("Authentication failed internally", {
        error_category: message.startsWith("Database schema mismatch")
          ? "auth_schema_mismatch"
          : "internal",
        error_type: "AuthenticationError",
        error_location: telemetryError(error).stack?.split("\n")[1] ?? "unavailable",
      });
      return new AuthenticationError();
    },
  });
export class Auth extends Context.Service<Auth, ReturnType<typeof makeAuth>>()(
  "chronicon/server/Auth",
) {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const pool = yield* DatabasePool;
      const email = yield* EmailDelivery;
      return yield* Effect.try({
        try: () => makeAuth(config, pool, email),
        catch: () => new AuthenticationError(),
      });
    }),
  );
}
