import { PgClient } from "@effect/sql-pg";
import { Crypto, DateTime, Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { projectSchema, type projectUpdate, type Principal, type PublishInput } from "@/lib/model";
import { databaseError } from "../database";
import { projectAccess } from "./access";
import { AppError, DatabaseError } from "../errors";
import { invalidateLibrary } from "../cache";
import { recordOperation } from "../observability";

export const findProject = Effect.fn("Library.findProject")(function* (
  principal: Principal,
  reference: string | { readonly id: string } | { readonly slug: string },
  write = false,
) {
  const sql = yield* PgClient.PgClient;
  const byId = !Schema.is(Schema.String)(reference) && "id" in reference;

  const value = Schema.is(Schema.String)(reference)
    ? reference
    : "id" in reference
      ? reference.id
      : reference.slug;

  const lookupProject = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: projectSchema,
    execute: (value) =>
      byId
        ? sql`SELECT * FROM project WHERE id = ${value}`
        : sql`SELECT * FROM project WHERE "organizationId" = ${principal.organizationId} AND slug = ${value}`,
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
      message: "To create projects, use a key with All projects and Write access.",
    });

  const memberships =
    yield* sql`SELECT id FROM member WHERE "organizationId" = ${principal.organizationId} AND "userId" = ${principal.ownerId} FOR SHARE`.pipe(
      databaseError("check team membership"),
    );

  if (!memberships.length)
    return yield* new AppError({
      status: 403,
      message: "Join this team before creating a project.",
    });

  const project = {
    organizationId: principal.organizationId,
    visibility: "private",
    id: yield* uuid,
    ownerId: principal.ownerId,
    ...input,
    createdAt: DateTime.formatIso(yield* DateTime.now),
    revision: 1,
  };

  yield* sql`INSERT INTO project ${sql.insert(project)} ON CONFLICT ("organizationId", slug) DO NOTHING`.pipe(
    databaseError("create project"),
  );

  return yield* findProject(principal, input.slug);
});

export const createProject = Effect.fn("Library.createProject")(
  (principal: Principal, input: { slug: string; name: string; description: string }) =>
    PgClient.PgClient.use((sql) => sql.withTransaction(insertProject(principal, input))).pipe(
      Effect.catchTag("SqlError", () => new DatabaseError({ operation: "create project" })),
    ),
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.tap((project) =>
        recordOperation("chronicon_project_created", {
          project_id: project.id,
          revision: project.revision,
        }),
      ),
      Effect.uninterruptible,
    ),
);

export const updateProject = Effect.fn("Projects.update")(
  function* (principal: Principal, input: typeof projectUpdate.Type) {
    const sql = yield* PgClient.PgClient;

    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`SELECT id FROM project WHERE id = ${input.id} FOR UPDATE`.pipe(
            databaseError("lock project"),
          );
          const current = yield* findProject(principal, { id: input.id }, true);

          const changed = yield* SqlSchema.findOneOption({
            Request: Schema.Void,
            Result: projectSchema,
            execute:
              () => sql`UPDATE project SET name = ${input.name}, description = ${input.description ?? current.description}, revision = revision + 1
        WHERE id = ${input.id} AND revision = ${input.expectedRevision} RETURNING *`,
          })(undefined).pipe(databaseError("update project"));

          if (Option.isNone(changed))
            return yield* new AppError({
              status: 409,
              message: "This project changed. Read it again before updating.",
            });

          return { ...changed.value, accessRole: current.accessRole };
        }),
      )
      .pipe(Effect.catchTag("SqlError", () => new DatabaseError({ operation: "update project" })));
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.tap((project) =>
        recordOperation("chronicon_project_updated", {
          project_id: project.id,
          revision: project.revision,
        }),
      ),
      Effect.uninterruptible,
    ),
);

// Called inside publishing's transaction. A supplied ID never falls back to creation.
export const resolvePublishProject = Effect.fn("Library.resolvePublishProject")(function* (
  principal: Principal,
  reference: PublishInput["project"],
  expectedRevision: number,
) {
  // Existing document updates may use a document grant without project access.
  // The publisher checks the target document after locking this project.
  if ("id" in reference && expectedRevision > 0) {
    const sql = yield* PgClient.PgClient;

    const found = yield* SqlSchema.findOneOption({
      Request: Schema.String,
      Result: projectSchema,
      execute: (id) => sql`SELECT * FROM project WHERE id = ${id}`,
    })(reference.id).pipe(databaseError("find publishing project"));

    if (Option.isSome(found)) return found.value;

    return yield* new AppError({
      status: 404,
      message: "Project not found. Check the project and account.",
    });
  }

  return yield* findProject(principal, reference, true).pipe(
    Effect.catchTag("AppError", (error) => {
      if (error.status !== 404 || !("name" in reference) || expectedRevision !== 0) return error;

      return insertProject(principal, reference);
    }),
  );
});
