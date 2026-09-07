import { PgClient } from "@effect/sql-pg";
import { Effect, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { documentSchema, projectSchema, type Principal } from "@/lib/model";
import { databaseError } from "../database";

export const loadLibrary = Effect.fn("Library.list")(function* (
  scope: Pick<Principal, "ownerId" | "projectIds">,
) {
  const sql = yield* PgClient.PgClient;
  const listProjects = SqlSchema.findAll({
    Request: Schema.Struct({
      ownerId: Schema.String,
      projectIds: Schema.NullOr(Schema.Array(Schema.String)),
    }),
    Result: projectSchema,
    execute: ({ ownerId, projectIds }) => sql`
      SELECT * FROM project WHERE "ownerId" = ${ownerId}
      AND ${projectIds === null ? sql`TRUE` : sql.in("id", projectIds)} ORDER BY name`,
  });
  const listDocuments = SqlSchema.findAll({
    Request: Schema.Array(Schema.String),
    Result: documentSchema,
    execute: (ids) =>
      sql`SELECT * FROM document WHERE ${sql.in("projectId", ids)} ORDER BY "updatedAt" DESC`,
  });

  const projects = yield* listProjects({
    ownerId: scope.ownerId,
    projectIds: scope.projectIds,
  }).pipe(databaseError("list projects"));
  const documents = projects.length
    ? yield* listDocuments(projects.map((project) => project.id)).pipe(
        databaseError("list documents"),
      )
    : [];
  return { projects, documents };
});
