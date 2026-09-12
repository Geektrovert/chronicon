import { PgClient } from "@effect/sql-pg";
import { recordOperation } from "../observability";
import { Crypto, Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import type { Principal } from "@/lib/model";
import {
  sharingInput,
  sharingReference,
  sharingMemberSchema,
  accessRoleSchema,
} from "@/lib/sharing";
import { databaseError } from "../database";
import { AppError, ConfigurationError, DatabaseError } from "../errors";
import { AppConfig } from "../config";
import { invalidateLibrary } from "../cache";
import {
  requireDocumentSharing,
  requireProjectSharing,
  documentRole,
  projectRole,
  ownerAccess,
} from "./access";
import { findProject } from "./projects";
import { findDocumentContext } from "./documents";
import { EmailDelivery } from "../services/email";
import { updateDocumentSharing } from "./document-sharing";
import { documentPublicPath } from "./public-links";

const sharingContext = Effect.fn("Sharing.context")(function* (
  principal: Principal,
  reference: typeof sharingReference.Type,
) {
  yield* ownerAccess(principal);

  if (reference.type === "project") {
    const project = yield* findProject(principal, { id: reference.id });

    return { project, document: null, role: yield* projectRole(principal, project) };
  }

  const { project, document } = yield* findDocumentContext(principal, reference.id);

  return { project, document, role: yield* documentRole(principal, document, project) };
});

const manageContext = Effect.fn("Sharing.manageContext")(function* (
  principal: Principal,
  reference: typeof sharingReference.Type,
) {
  const context = yield* sharingContext(principal, reference);

  if (context.document) yield* requireDocumentSharing(principal, context.document, context.project);
  else yield* requireProjectSharing(principal, context.project);

  return context;
});

export const readSharing = Effect.fn("Sharing.read")(function* (
  principal: Principal,
  reference: typeof sharingReference.Type,
) {
  const sql = yield* PgClient.PgClient;
  const config = yield* AppConfig;
  const { project, document, role } = yield* sharingContext(principal, reference);

  if (!role)
    return yield* new AppError({
      status: 404,
      message: "Shared content not found. Check that your account still has access.",
    });
  const canManage = role === "full_access" && principal.emailVerified;
  const canReadParent = !document || !!(yield* projectRole(principal, project));

  const members = canManage
    ? yield* SqlSchema.findAll({
        Request: Schema.Void,
        Result: sharingMemberSchema,
        execute: () =>
          document
            ? sql`
      SELECT u.id AS "userId", u.name, u.email, 'full_access' AS role, true AS inherited, false AS "canRemove" FROM "user" u WHERE u.id = ${project.ownerId} AND ${canReadParent}
      UNION ALL SELECT u.id AS "userId", u.name, u.email, a.role, true AS inherited, false AS "canRemove" FROM project_access a JOIN "user" u ON u.id = a."userId" WHERE a."projectId" = ${project.id} AND u.id <> ${project.ownerId} AND ${canReadParent}
      UNION ALL SELECT u.id AS "userId", u.name, u.email, a.role, false AS inherited, u.id <> ${principal.ownerId} AS "canRemove" FROM document_access a JOIN "user" u ON u.id = a."userId" WHERE a."documentId" = ${document.id} AND u.id <> ${project.ownerId}`
            : sql`SELECT u.id AS "userId", u.name, u.email, 'full_access' AS role, true AS inherited, false AS "canRemove" FROM "user" u WHERE u.id = ${project.ownerId}
      UNION ALL SELECT u.id AS "userId", u.name, u.email, a.role, false AS inherited, u.id <> ${principal.ownerId} AS "canRemove" FROM project_access a JOIN "user" u ON u.id = a."userId" WHERE a."projectId" = ${project.id} AND u.id <> ${project.ownerId}`,
      })(undefined).pipe(databaseError("read sharing members"))
    : [];

  const invitations = canManage
    ? yield* SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ id: Schema.String, email: Schema.String, role: accessRoleSchema }),
        execute: () =>
          sql`SELECT id, email, role FROM sharing_invitation WHERE status = 'pending' AND "expiresAt" > CURRENT_TIMESTAMP AND ${document ? sql`"documentId" = ${document.id}` : sql`"projectId" = ${project.id}`} ORDER BY "createdAt"`,
      })(undefined).pipe(databaseError("read sharing invitations"))
    : [];

  return {
    visibility: document?.visibility ?? project.visibility,
    revision: document?.sharingRevision ?? null,
    inheritedPublic: !!document && project.visibility === "public",
    canManage,
    role,
    publicUrl: `${config.origin}${document ? yield* documentPublicPath(document.id) : `/public/projects/${project.id}`}`,
    members,
    invitations,
  };
});

export const changeSharing = Effect.fn("Sharing.change")(
  function* (principal: Principal, input: typeof sharingInput.Type) {
    const sql = yield* PgClient.PgClient;
    const config = yield* AppConfig;
    const emailDelivery = yield* EmailDelivery;
    const initial = yield* manageContext(principal, input);
    const uuid = (yield* Crypto.Crypto).randomUUIDv4.pipe(Effect.orDie);

    const result = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`SELECT id FROM project WHERE id = ${initial.project.id} FOR UPDATE`.pipe(
            databaseError("lock sharing"),
          );
          const { project, document } = yield* manageContext(principal, input);
          const table = document ? "document_access" : "project_access";
          const column = document ? "documentId" : "projectId";

          if (input.action === "visibility") {
            if (document && input.type === "document")
              yield* updateDocumentSharing(principal, document, project, {
                visibility: input.visibility,
                // Preserve the existing sharing endpoint's optional precondition for older clients.
                expectedRevision: input.expectedRevision ?? document.sharingRevision,
              });
            else
              yield* sql`UPDATE project SET visibility = ${input.visibility} WHERE id = ${project.id}`.pipe(
                databaseError("publish project access"),
              );
          } else if (input.action === "remove") {
            if (input.userId === principal.ownerId)
              return yield* new AppError({
                status: 400,
                message: "Ask someone else with full access to remove your access.",
              });

            if (input.userId === project.ownerId)
              return yield* new AppError({
                status: 400,
                message: "The project creator keeps full access.",
              });
            yield* sql`DELETE FROM ${sql(table)} WHERE ${sql(column)} = ${input.id} AND "userId" = ${input.userId}`.pipe(
              databaseError("remove shared access"),
            );
            yield* sql`UPDATE sharing_invitation SET status = 'cancelled' WHERE ${sql(column)} = ${input.id} AND email = (SELECT lower(email) FROM "user" WHERE id = ${input.userId}) AND status = 'pending'`.pipe(
              databaseError("cancel removed access invitations"),
            );
          } else if (input.action === "cancel") {
            yield* sql`UPDATE sharing_invitation SET status = 'cancelled' WHERE id = ${input.invitationId} AND ${sql(column)} = ${input.id} AND status = 'pending'`.pipe(
              databaseError("cancel sharing invitation"),
            );
          } else {
            const email = input.email.trim().toLowerCase();

            const user = yield* SqlSchema.findOneOption({
              Request: Schema.String,
              Result: Schema.Struct({ id: Schema.String }),
              execute: (email) =>
                sql`SELECT id FROM "user" WHERE lower(email) = ${email} AND "emailVerified" = true`,
            })(email).pipe(databaseError("find shared account"));

            if (Option.isSome(user)) {
              if (user.value.id === project.ownerId)
                return yield* new AppError({
                  status: 400,
                  message: "The project creator already has full access.",
                });
              yield* sql`INSERT INTO ${sql(table)} ${sql.insert({ [column]: input.id, userId: user.value.id, role: input.role })}
            ON CONFLICT (${sql(column)}, "userId") DO UPDATE SET role = EXCLUDED.role`.pipe(
                databaseError("grant shared access"),
              );
              yield* sql`UPDATE sharing_invitation SET status = 'cancelled' WHERE ${sql(column)} = ${input.id} AND email = ${email} AND status = 'pending'`.pipe(
                databaseError("cancel replaced invitations"),
              );
            } else {
              yield* Effect.try({
                try: () => emailDelivery.requireConfigured(),
                catch: (error) =>
                  Schema.is(AppError)(error)
                    ? error
                    : new ConfigurationError({
                        message:
                          error instanceof Error &&
                          error.message.startsWith("Unable to get redacted value")
                            ? "secret_registry_mismatch"
                            : "configuration_read_error",
                      }),
              }).pipe(
                Effect.catchTag("ConfigurationError", (error) =>
                  Effect.logError("Email delivery failed").pipe(
                    Effect.annotateLogs({ stage: "configuration", code: error.message }),
                    Effect.andThen(
                      new AppError({
                        status: 503,
                        message:
                          "Email delivery is unavailable. Contact the workspace administrator.",
                      }),
                    ),
                  ),
                ),
              );
              // Reissuing a pending invitation rotates its token and replaces its grant.
              yield* sql`UPDATE sharing_invitation SET status = 'cancelled' WHERE ${sql(column)} = ${input.id} AND email = ${email} AND status = 'pending'`.pipe(
                databaseError("replace sharing invitation"),
              );
              const id = yield* uuid;
              yield* sql`INSERT INTO sharing_invitation (id, type, ${sql(column)}, email, role, "inviterId", status, "expiresAt")
            VALUES (${id}, ${input.type}, ${input.id}, ${email}, ${input.role}, ${principal.ownerId}, 'pending', CURRENT_TIMESTAMP + interval '7 days')`.pipe(
                databaseError("create sharing invitation"),
              );

              return { id, email, resourceName: document?.title ?? project.name };
            }
          }

          return null;
        }),
      )
      .pipe(Effect.catchTag("SqlError", () => new DatabaseError({ operation: "change sharing" })));

    if (result)
      yield* Effect.tryPromise({
        try: () =>
          emailDelivery.sendResourceInvitation({
            email: result.email,
            inviterName: principal.name,
            resourceName: result.resourceName,
            resourceType: input.type,
            url: `${config.origin}/invitations/${result.id}?type=resource`,
          }),
        catch: () =>
          new AppError({
            status: 503,
            message:
              "The invitation was saved, but email delivery could not be confirmed. Invite this email again to send a new link.",
          }),
      });

    return yield* readSharing(principal, input);
  },
  (effect, principal, input) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.tap(() =>
        recordOperation("chronicon_sharing_changed", {
          action: input.action,
          resource_type: input.type,
        }),
      ),
      Effect.uninterruptible,
    ),
);
