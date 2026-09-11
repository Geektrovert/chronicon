import { PgClient } from "@effect/sql-pg";
import { recordOperation } from "../observability";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import type { Principal } from "@/lib/model";
import { accessRoleSchema, invitationTypeSchema, resourceTypeSchema } from "@/lib/sharing";
import { Auth, authCall } from "../auth";
import { AppError, DatabaseError } from "../errors";
import { databaseError } from "../database";
import { ownerAccess, requireDocumentSharing, requireProjectSharing } from "./access";
import { findDocumentContext } from "./documents";
import { findProject } from "./projects";

const resourceInvitation = Schema.Struct({
  id: Schema.String,
  type: resourceTypeSchema,
  projectId: Schema.NullOr(Schema.String),
  documentId: Schema.NullOr(Schema.String),
  email: Schema.String,
  role: accessRoleSchema,
  inviterId: Schema.String,
  status: Schema.String,
  expiresAt: Schema.String,
  expired: Schema.Boolean,
  resourceName: Schema.String,
  inviterName: Schema.String,
});
const findResourceInvitation = Effect.fn("Invitations.findResource")(function* (
  principal: Principal,
  id: string,
) {
  const sql = yield* PgClient.PgClient;
  const found = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: resourceInvitation,
    execute: (
      id,
    ) => sql`SELECT i.id, i.type, i."projectId", i."documentId", i.email, i.role, i."inviterId", i.status,
      i."expiresAt"::text AS "expiresAt", i."expiresAt" <= statement_timestamp() AS expired,
      coalesce(p.name, d.title) AS "resourceName", u.name AS "inviterName"
      FROM sharing_invitation i LEFT JOIN project p ON p.id = i."projectId" LEFT JOIN document d ON d.id = i."documentId"
      JOIN "user" u ON u.id = i."inviterId" WHERE i.id = ${id} AND i.email = ${principal.email?.toLowerCase() ?? ""}`,
  })(id).pipe(databaseError("find resource invitation"));
  if (Option.isNone(found))
    return yield* new AppError({
      status: 404,
      message: "Invitation not found. Sign in with the email that received it.",
    });
  return found.value;
});
const authorizeResourceInvitation = Effect.fn("Invitations.authorizeResource")(function* (
  invitation: typeof resourceInvitation.Type,
) {
  const sql = yield* PgClient.PgClient;
  const inviter = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      email: Schema.String,
      emailVerified: Schema.Boolean,
    }),
    execute: (id) =>
      sql`SELECT id, name, email, "emailVerified" FROM "user" WHERE id = ${id} AND coalesce(banned, false) = false`,
  })(invitation.inviterId).pipe(databaseError("check invitation sender"));
  if (Option.isNone(inviter))
    return yield* new AppError({
      status: 403,
      message: "This invitation is no longer valid. Ask for a new invitation.",
    });
  const sender: Principal = {
    ownerId: inviter.value.id,
    name: inviter.value.name,
    email: inviter.value.email,
    emailVerified: inviter.value.emailVerified,
    organizationId: `default_${inviter.value.id}`,
    access: "owner",
    projectIds: null,
    canWrite: true,
    canShare: true,
  };
  const target = invitation.documentId ?? invitation.projectId;
  if (!target)
    return yield* new AppError({ status: 404, message: "Shared content no longer exists." });
  if (invitation.type === "document") {
    const context = yield* findDocumentContext(sender, target);
    yield* requireDocumentSharing(sender, context.document, context.project);
  } else yield* requireProjectSharing(sender, yield* findProject(sender, { id: target }));
  return target;
});

export const readInvitation = Effect.fn("Invitations.read")(function* (
  principal: Principal,
  id: string,
  type: typeof invitationTypeSchema.Type,
) {
  yield* ownerAccess(principal);
  if (type === "resource") {
    const invitation = yield* findResourceInvitation(principal, id);
    const pending = invitation.status === "pending" && !invitation.expired;
    const senderAvailable = pending
      ? yield* authorizeResourceInvitation(invitation).pipe(
          Effect.as(true),
          Effect.catchTag("AppError", (error) =>
            error.status === 403 || error.status === 404
              ? Effect.succeed(false)
              : Effect.fail(error),
          ),
        )
      : false;
    // Old invitation tokens must not reveal later title or account-name changes.
    const disclose = principal.emailVerified && pending && senderAvailable;
    const status =
      invitation.status === "pending"
        ? invitation.expired
          ? "expired"
          : senderAvailable
            ? "pending"
            : "cancelled"
        : invitation.status;
    return {
      type,
      resourceName: disclose ? invitation.resourceName : "Shared content",
      inviterName: disclose ? invitation.inviterName : "A Chronicon user",
      email: invitation.email,
      status,
      expiresAt: invitation.expiresAt,
      requiresEmailVerification: !principal.emailVerified,
    };
  }
  const sql = yield* PgClient.PgClient;
  const found = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({
      resourceName: Schema.String,
      inviterName: Schema.String,
      email: Schema.String,
      status: Schema.String,
      expiresAt: Schema.String,
      senderAvailable: Schema.Boolean,
    }),
    execute: (id) => sql`SELECT o.name AS "resourceName", u.name AS "inviterName", i.email,
      CASE WHEN i.status = 'pending' AND i."expiresAt" <= CURRENT_TIMESTAMP THEN 'expired' ELSE i.status END AS status,
      i."expiresAt"::text AS "expiresAt",
      EXISTS (SELECT 1 FROM member m WHERE m."organizationId" = i."organizationId" AND m."userId" = i."inviterId"
        AND m.role IN ('owner', 'admin') AND u."emailVerified" = true AND coalesce(u.banned, false) = false) AS "senderAvailable"
      FROM invitation i JOIN organization o ON o.id = i."organizationId"
      JOIN "user" u ON u.id = i."inviterId" WHERE i.id = ${id} AND lower(i.email) = ${principal.email?.toLowerCase() ?? ""}`,
  })(id).pipe(databaseError("find team invitation"));
  if (Option.isNone(found))
    return yield* new AppError({
      status: 404,
      message: "Invitation not found. Sign in with the email that received it.",
    });
  const { senderAvailable, ...invitation } = found.value;
  const pending = invitation.status === "pending" && senderAvailable;
  const disclose = principal.emailVerified && pending;
  return {
    ...invitation,
    type,
    status: invitation.status === "pending" && !senderAvailable ? "canceled" : invitation.status,
    resourceName: disclose ? invitation.resourceName : "A team",
    inviterName: disclose ? invitation.inviterName : "A Chronicon user",
    requiresEmailVerification: !principal.emailVerified,
  };
});

export const acceptInvitation = Effect.fn("Invitations.accept")(
  function* (
    principal: Principal,
    headers: Headers,
    id: string,
    type: typeof invitationTypeSchema.Type,
  ) {
    yield* ownerAccess(principal);
    if (!principal.emailVerified)
      return yield* new AppError({
        status: 403,
        message: "Verify your email before accepting this invitation.",
      });
    if (type === "team") {
      const auth = yield* Auth;
      const invitation = yield* readInvitation(principal, id, type);
      if (invitation.status !== "pending")
        return yield* new AppError({
          status: 400,
          message: "This invitation is no longer pending. Ask for a new invitation.",
        });
      const accepted = yield* authCall(() =>
        auth.api.acceptInvitation({ headers, body: { invitationId: id } }),
      );
      yield* authCall(() =>
        auth.api.setActiveOrganization({
          headers,
          body: { organizationId: accepted.member.organizationId },
        }),
      );
      return { redirectUrl: "/settings/team" };
    }
    const sql = yield* PgClient.PgClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const initial = yield* findResourceInvitation(principal, id);
          const projectId =
            initial.projectId ??
            (yield* sql<{
              projectId: string;
            }>`SELECT "projectId" FROM document WHERE id = ${initial.documentId}`.pipe(
              databaseError("find invited project"),
            ))[0]?.projectId;
          if (!projectId)
            return yield* new AppError({
              status: 404,
              message: "Shared content no longer exists.",
            });
          yield* sql`SELECT id FROM project WHERE id = ${projectId} FOR UPDATE`.pipe(
            databaseError("lock invitation project"),
          );
          const invitation = yield* findResourceInvitation(principal, id);
          if (invitation.status !== "pending" || invitation.expired)
            return yield* new AppError({
              status: 400,
              message: "This invitation is no longer pending. Ask for a new invitation.",
            });
          const target = yield* authorizeResourceInvitation(invitation);
          const table = invitation.type === "document" ? "document_access" : "project_access";
          const column = invitation.type === "document" ? "documentId" : "projectId";
          // Acceptance never lowers a grant issued through another path while the email was pending.
          yield* sql`INSERT INTO ${sql(table)} ${sql.insert({ [column]: target, userId: principal.ownerId, role: invitation.role })}
      ON CONFLICT (${sql(column)}, "userId") DO UPDATE SET role = CASE
        WHEN ${sql(table)}.role = 'full_access' OR EXCLUDED.role = 'full_access' THEN 'full_access'
        WHEN ${sql(table)}.role = 'edit' OR EXCLUDED.role = 'edit' THEN 'edit' ELSE 'view' END`.pipe(
            databaseError("accept resource grant"),
          );
          yield* sql`UPDATE sharing_invitation SET status = 'accepted' WHERE id = ${id}`.pipe(
            databaseError("accept resource invitation"),
          );
          return {
            redirectUrl:
              invitation.type === "document" ? `/documents/${target}` : `/projects/${target}`,
          };
        }),
      )
      .pipe(
        Effect.catchTag("SqlError", () => new DatabaseError({ operation: "accept invitation" })),
        Effect.uninterruptible,
      );
  },
  (effect, _principal, _headers, _id, type) =>
    effect.pipe(
      Effect.tap(() => recordOperation("chronicon_invitation_accepted", { invitation_type: type })),
    ),
);
