import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { databaseError } from "../database";
import { AppError } from "../errors";
import { Storage } from "../services/storage";
import { annotateTelemetry } from "../observability";

const publicProjectSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
});
const publicDocumentSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  kind: Schema.String,
  updatedAt: Schema.String,
});
export const readPublicProject = Effect.fn("Public.project")(function* (id: string) {
  const sql = yield* PgClient.PgClient;
  const project = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: publicProjectSchema,
    execute: (id) =>
      sql`SELECT id, name, description FROM project WHERE id = ${id} AND visibility = 'public'`,
  })(id).pipe(databaseError("read public project"));
  if (Option.isNone(project))
    return yield* new AppError({ status: 404, message: "This project is not public." });
  const documents = yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: publicDocumentSchema,
    execute: (
      id,
    ) => sql`SELECT d.id, d.title, d.summary, d.kind, d."updatedAt" FROM document d JOIN project p ON p.id = d."projectId"
      WHERE p.id = ${id} AND p.visibility = 'public' AND d.archived = false ORDER BY d."updatedAt" DESC`,
  })(id).pipe(databaseError("list public documents"));
  const visible =
    yield* sql`SELECT id FROM project WHERE id = ${id} AND visibility = 'public'`.pipe(
      databaseError("confirm public project access"),
    );
  if (!visible.length)
    return yield* new AppError({ status: 404, message: "This project is not public." });
  yield* annotateTelemetry({ project_id: project.value.id, result_count: documents.length });
  return { project: project.value, documents };
});
export const readPublicDocument = Effect.fn("Public.document")(function* (id: string) {
  const sql = yield* PgClient.PgClient;
  const storage = yield* Storage;
  const found = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({
      ...publicDocumentSchema.fields,
      blobPath: Schema.String,
      publicProjectId: Schema.NullOr(Schema.String),
      publicProjectName: Schema.NullOr(Schema.String),
    }),
    execute: (id) => sql`SELECT d.id, d.title, d.summary, d.kind, d."updatedAt", r."blobPath",
      CASE WHEN p.visibility = 'public' THEN p.id ELSE NULL END AS "publicProjectId",
      CASE WHEN p.visibility = 'public' THEN p.name ELSE NULL END AS "publicProjectName"
      FROM document d JOIN project p ON p.id = d."projectId" JOIN revision r ON r."documentId" = d.id AND r.version = d.revision
      WHERE d.id = ${id} AND d.archived = false AND (d.visibility = 'public' OR p.visibility = 'public')`,
  })(id).pipe(databaseError("read public document"));
  if (Option.isNone(found))
    return yield* new AppError({ status: 404, message: "This document is not public." });
  const { blobPath, ...document } = found.value;
  const html = yield* storage.read(blobPath);
  if (Option.isNone(html))
    return yield* new AppError({ status: 404, message: "This document is unavailable." });
  // Recheck after storage IO so an unpublish during the download closes access.
  const visible = yield* sql<{
    publicProjectId: string | null;
    publicProjectName: string | null;
  }>`SELECT
    CASE WHEN p.visibility = 'public' THEN p.id ELSE NULL END AS "publicProjectId",
    CASE WHEN p.visibility = 'public' THEN p.name ELSE NULL END AS "publicProjectName"
    FROM document d JOIN project p ON p.id = d."projectId"
    WHERE d.id = ${id} AND d.archived = false AND (d.visibility = 'public' OR p.visibility = 'public')`.pipe(
    databaseError("confirm public access"),
  );
  if (!visible.length)
    return yield* new AppError({ status: 404, message: "This document is not public." });
  yield* annotateTelemetry({
    document_id: document.id,
    ...(visible[0]?.publicProjectId ? { project_id: visible[0].publicProjectId } : {}),
  });
  return { document: { ...document, ...visible[0] }, html: html.value };
});
