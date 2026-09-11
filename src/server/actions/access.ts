import { Effect, Option, Schema } from "effect";
import { PgClient } from "@effect/sql-pg";
import { SqlSchema } from "effect/unstable/sql";
import { Auth, authCall } from "../auth";
import { AppConfig } from "../config";
import { findOwnerEmail } from "./owner";
import { AppError, deny } from "../errors";
import {
  accessRoleSchema,
  type AccessRole,
  type Document,
  type Principal,
  type Project,
} from "@/lib/model";
import { databaseError, DatabasePool } from "../database";
import { defaultTeamId, ensureDefaultTeam } from "./default-team";
import { annotatePrincipal, annotateTelemetry } from "../observability";

const keyMetadata = Schema.Struct({
  organizationId: Schema.optionalKey(Schema.String),
  projectIds: Schema.NullOr(Schema.Array(Schema.String)).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
});

const keyPermissions = Schema.Record(Schema.String, Schema.Array(Schema.String));

export const authenticate = Effect.fn("Access.authenticate")(
  function* (headers: Headers) {
    const auth = yield* Auth;
    const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const key = headers.get("x-api-key") || bearer;

    if (key) {
      const result = yield* authCall(() =>
        auth.api.verifyApiKey({ body: { key, permissions: { documents: ["read"] } } }),
      );

      if (result.error?.code === "RATE_LIMITED")
        return yield* new AppError({
          status: 429,
          message: "This agent has reached its request limit. Wait a minute and try again.",
        });

      if (!result.valid || !result.key)
        return yield* new AppError({
          status: 401,
          message:
            "This agent key is invalid or expired. Create a new key from Connect an agent in your workspace.",
        });
      const owner = yield* findOwnerEmail(result.key.referenceId);

      if (Option.isNone(owner) || owner.value.banned)
        return yield* deny(
          "This key's account no longer exists. Sign in with an active account and create a new key.",
        );

      const metadata = yield* Schema.decodeUnknownEffect(keyMetadata)(result.key.metadata).pipe(
        Effect.mapError(
          () =>
            new AppError({
              status: 403,
              message:
                "This key has no project access. Create a new key for this project from Connect an agent.",
            }),
        ),
      );

      const permissions = yield* Schema.decodeUnknownEffect(keyPermissions)(
        result.key.permissions,
      ).pipe(Effect.orElseSucceed((): typeof keyPermissions.Type => ({})));

      return {
        ownerId: result.key.referenceId,
        name: result.key.name || "Agent",
        organizationId: metadata.organizationId ?? defaultTeamId(result.key.referenceId),
        email: owner.value.email,
        emailVerified: owner.value.emailVerified,
        access: "agent",
        keyId: result.key.id,
        projectIds: metadata.projectIds,
        canWrite: !!permissions.documents?.includes("write"),
      } satisfies Principal;
    }

    const session = yield* authCall(() => auth.api.getSession({ headers }));

    if (!session)
      return yield* new AppError({ status: 401, message: "Sign in to open this workspace." });
    const sql = yield* PgClient.PgClient;
    const fallbackOrganizationId = defaultTeamId(session.user.id);
    const activeOrganizationId = session.session.activeOrganizationId ?? fallbackOrganizationId;

    const membership =
      yield* sql`SELECT id FROM member WHERE "organizationId" = ${activeOrganizationId} AND "userId" = ${session.user.id}`.pipe(
        databaseError("check active team"),
      );

    if (!membership.length) {
      const fallbackMembership =
        activeOrganizationId === fallbackOrganizationId
          ? membership
          : yield* sql`SELECT id FROM member WHERE "organizationId" = ${fallbackOrganizationId} AND "userId" = ${session.user.id}`.pipe(
              databaseError("check default team"),
            );

      if (!fallbackMembership.length) {
        const pool = yield* DatabasePool;
        yield* authCall(() => ensureDefaultTeam(pool, session.user));
      }
    }

    return {
      ownerId: session.user.id,
      organizationId: membership.length ? activeOrganizationId : fallbackOrganizationId,
      emailVerified: session.user.emailVerified,
      name: session.user.name,
      email: session.user.email,
      access: "owner",
      projectIds: null,
      canWrite: true,
    } satisfies Principal;
  },
  (effect) => effect.pipe(Effect.tap(annotatePrincipal)),
);

const strongerRole = (left: AccessRole | null, right: AccessRole | null): AccessRole | null => {
  if (left === "full_access" || right === "full_access") return "full_access";

  if (left === "edit" || right === "edit") return "edit";

  return left ?? right;
};

// Key restrictions limit the issuing user's current permission. They never grant access.
const keyAllowsProject = (principal: Principal, project: Project) =>
  (principal.access !== "agent" || principal.organizationId === project.organizationId) &&
  (principal.projectIds === null || principal.projectIds.includes(project.id));

export const projectRole = Effect.fn("Access.projectRole")(function* (
  principal: Principal,
  project: Project,
) {
  if (!keyAllowsProject(principal, project)) return null;
  const sql = yield* PgClient.PgClient;

  if (project.ownerId === principal.ownerId) {
    const membership =
      yield* sql`SELECT id FROM member WHERE "organizationId" = ${project.organizationId} AND "userId" = ${principal.ownerId}`.pipe(
        databaseError("check project ownership"),
      );

    if (membership.length) return "full_access" as const;
  }

  if (!principal.emailVerified) return null;

  const found = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ role: accessRoleSchema }),
    execute: () =>
      sql`SELECT role FROM project_access WHERE "projectId" = ${project.id} AND "userId" = ${principal.ownerId}`,
  })(undefined).pipe(databaseError("check project access"));

  return Option.isSome(found) ? found.value.role : null;
});

export const documentRole = Effect.fn("Access.documentRole")(function* (
  principal: Principal,
  document: Document,
  project: Project,
) {
  if (!keyAllowsProject(principal, project)) return null;
  const inherited = yield* projectRole(principal, project);

  if (inherited === "full_access" || !principal.emailVerified) return inherited;
  const sql = yield* PgClient.PgClient;

  const found = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ role: accessRoleSchema }),
    execute: () =>
      sql`SELECT role FROM document_access WHERE "documentId" = ${document.id} AND "userId" = ${principal.ownerId}`,
  })(undefined).pipe(databaseError("check document access"));

  return strongerRole(inherited, Option.isSome(found) ? found.value.role : null);
});

export const projectAccess = Effect.fn("Access.project")(function* (
  principal: Principal,
  project: Project | undefined,
  write = false,
) {
  const role = project ? yield* projectRole(principal, project) : null;

  if (!project || !role)
    return yield* new AppError({
      status: 404,
      message: "Project not found. Check the project and account.",
    });

  if (write && (!principal.canWrite || role === "view"))
    return yield* deny(
      "You have view access to this project. Ask someone with full access for edit access.",
    );
  yield* annotateTelemetry({ project_id: project.id, organization_id: project.organizationId });

  return { ...project, accessRole: role };
});

export const documentAccess = Effect.fn("Access.document")(function* (
  principal: Principal,
  document: Document,
  project: Project,
  write = false,
) {
  const role = yield* documentRole(principal, document, project);

  if (!role)
    return yield* new AppError({
      status: 404,
      message: "Document not found. Check the document and account.",
    });

  if (write && (!principal.canWrite || role === "view"))
    return yield* deny(
      "You have view access to this document. Ask someone with full access for edit access.",
    );
  yield* annotateTelemetry({
    document_id: document.id,
    project_id: project.id,
    organization_id: project.organizationId,
  });

  return { ...document, accessRole: role };
});

export const requireProjectSharing = Effect.fn("Access.projectSharing")(function* (
  principal: Principal,
  project: Project,
) {
  yield* ownerAccess(principal);

  if (!principal.emailVerified) return yield* deny("Verify your email before sharing a project.");

  if ((yield* projectRole(principal, project)) !== "full_access")
    return yield* deny("You need full access to share this project.");
});

export const requireDocumentSharing = Effect.fn("Access.documentSharing")(function* (
  principal: Principal,
  document: Document | undefined,
  project: Project,
) {
  if (!principal.canWrite)
    return yield* deny("Use a key with Write access to change document sharing.");

  if (!principal.emailVerified) return yield* deny("Verify your email before sharing a document.");

  const role = document
    ? yield* documentRole(principal, document, project)
    : yield* projectRole(principal, project);

  if (role !== "full_access") return yield* deny("You need full access to share this document.");
});

export const ownerAccess = Effect.fn("Access.owner")(function* (principal: Principal) {
  if (principal.access !== "owner")
    return yield* deny(
      "Sign in through the browser to manage keys, stars, and archived documents.",
    );
});

export const sameOrigin = Effect.fn("Access.sameOrigin")(function* (request: Request) {
  if (request.headers.has("authorization") || request.headers.has("x-api-key")) return;
  const { origin } = yield* AppConfig;

  if (request.headers.get("origin") !== origin)
    return yield* deny("Reload this page and try again.");
});
