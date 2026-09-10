import { PgClient } from "@effect/sql-pg";
import { Crypto, DateTime, Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { projectSchema, type projectUpdate, type Principal, type PublishInput } from "@/lib/model";
import { databaseError } from "../database";
import { projectAccess } from "./access";
import { AppError } from "../errors";
import { invalidateLibrary } from "../cache";

export const findProject = Effect.fn("Library.findProject")(function* (
  principal: Principal,
  reference: string | { readonly id: string } | { readonly slug: string },
  write = false,
) {
  const sql = yield* PgClient.PgClient;
  const byId = typeof reference !== "string" && "id" in reference;
  const value =
    typeof reference === "string" ? reference : "id" in reference ? reference.id : reference.slug;
  const lookupProject = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: projectSchema,
    execute: (value) =>
      byId
        ? sql`SELECT * FROM project WHERE "ownerId" = ${principal.ownerId} AND id = ${value}`
        : sql`SELECT * FROM project WHERE "ownerId" = ${principal.ownerId} AND slug = ${value}`,
  });
  const project = yield* lookupProject(value).pipe(databaseError("find project"));
  return yield* projectAccess(principal, Option.getOrUndefined(project), write);
});

const insertProject = Effect.fn("Library.insertProject")(function* (
  principal: Principal,
  input: { slug: string; name: string; description: string },
) {
  const sql = yield* PgClient.PgClient;
  const uuid = (yield* Crypto.Crypto).randomUUIDv4.pipe(Effect.orDie);
  if (principal.projectIds || !principal.canWrite)
    return yield* new AppError({
      status: 403,
      message: "To create projects, use a key with All projects and Read and edit access.",
    });
  const project = {
    id: yield* uuid,
    ownerId: principal.ownerId,
    ...input,
    createdAt: DateTime.formatIso(yield* DateTime.now),
    revision: 1,
  };
  yield* sql`INSERT INTO project ${sql.insert(project)} ON CONFLICT ("ownerId", slug) DO NOTHING`.pipe(
    databaseError("create project"),
  );
  return yield* findProject(principal, input.slug);
});

export const createProject = Effect.fn("Library.createProject")(
  (principal: Principal, input: { slug: string; name: string; description: string }) =>
    insertProject(principal, input),
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.uninterruptible,
    ),
);

export const updateProject = Effect.fn("Projects.update")(
  function* (principal: Principal, input: typeof projectUpdate.Type) {
    const current = yield* findProject(principal, { id: input.id }, true);
    const sql = yield* PgClient.PgClient;
    const changed = yield* SqlSchema.findOneOption({
      Request: Schema.Void,
      Result: projectSchema,
      execute:
        () => sql`UPDATE project SET name = ${input.name}, description = ${input.description ?? current.description}, revision = revision + 1
        WHERE id = ${input.id} AND "ownerId" = ${principal.ownerId} AND revision = ${input.expectedRevision} RETURNING *`,
    })(undefined).pipe(databaseError("update project"));
    if (Option.isNone(changed))
      return yield* new AppError({
        status: 409,
        message: "This project changed. Read it again before updating.",
      });
    return changed.value;
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.uninterruptible,
    ),
);

// Called inside publishing's transaction. A supplied ID never falls back to creation.
export const resolvePublishProject = Effect.fn("Library.resolvePublishProject")(function* (
  principal: Principal,
  reference: PublishInput["project"],
  expectedRevision: number,
) {
  return yield* findProject(principal, reference, true).pipe(
    Effect.catchTag("AppError", (error) => {
      if (error.status !== 404 || !("name" in reference) || expectedRevision !== 0) return error;
      return insertProject(principal, reference);
    }),
  );
});
