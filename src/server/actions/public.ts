import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { publicDocumentAddressSchema } from "@/lib/model";
import { publicDocumentPath } from "@/lib/public-links";
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
    Result: Schema.Struct({
      ...publicDocumentSchema.fields,
      ...publicDocumentAddressSchema.fields,
    }),
    execute: (
      id,
    ) => sql`SELECT d.id, d.title, d.summary, d.kind, d."updatedAt", profile.username, l.slug, l.identifier
      FROM document d JOIN project p ON p.id = d."projectId"
      JOIN public_document_link l ON l."documentId" = d.id JOIN "user" profile ON profile.id = l."ownerId"
      WHERE p.id = ${id} AND p.visibility = 'public' AND d.archived = false ORDER BY d."updatedAt" DESC`,
  })(id).pipe(databaseError("list public documents"));
  const visible =
    yield* sql`SELECT id FROM project WHERE id = ${id} AND visibility = 'public'`.pipe(
      databaseError("confirm public project access"),
    );
  if (!visible.length)
    return yield* new AppError({ status: 404, message: "This project is not public." });
  yield* annotateTelemetry({ project_id: project.value.id, result_count: documents.length });
  return {
    project: project.value,
    documents: documents.map((document) => ({
      ...document,
      publicPath: publicDocumentPath(document),
    })),
  };
});

type PublicDocumentReference = { id: string } | { username: string; documentSlug: string };

const findPublicDocument = Effect.fn("Public.findDocument")(function* (
  reference: PublicDocumentReference,
) {
  const sql = yield* PgClient.PgClient;
  let condition;
  if ("id" in reference) {
    condition = sql`d.id = ${reference.id}`;
  } else {
    const match = /^(.+)-([0-9a-f]{4})$/i.exec(reference.documentSlug);
    const address = yield* Schema.decodeUnknownEffect(publicDocumentAddressSchema)({
      username: reference.username.toLowerCase(),
      slug: match?.[1],
      identifier: match?.[2]?.toLowerCase(),
    }).pipe(
      Effect.mapError(() => new AppError({ status: 404, message: "This document is not public." })),
    );
    condition = sql`l."ownerId" = (SELECT "userId" FROM public_username WHERE username = ${address.username})
      AND l.slug = ${address.slug} AND l.identifier = ${address.identifier}`;
  }
  const found = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({
      ...publicDocumentSchema.fields,
      ...publicDocumentAddressSchema.fields,
      blobPath: Schema.String,
      publicProjectId: Schema.NullOr(Schema.String),
      publicProjectName: Schema.NullOr(Schema.String),
    }),
    execute:
      () => sql`SELECT d.id, d.title, d.summary, d.kind, d."updatedAt", r."blobPath", profile.username, l.slug, l.identifier,
      CASE WHEN p.visibility = 'public' THEN p.id ELSE NULL END AS "publicProjectId",
      CASE WHEN p.visibility = 'public' THEN p.name ELSE NULL END AS "publicProjectName"
      FROM document d JOIN project p ON p.id = d."projectId" JOIN revision r ON r."documentId" = d.id AND r.version = d.revision
      JOIN public_document_link l ON l."documentId" = d.id JOIN "user" profile ON profile.id = l."ownerId"
      WHERE ${condition} AND d.archived = false AND (d.visibility = 'public' OR p.visibility = 'public')`,
  })(undefined).pipe(databaseError("read public document"));
  if (Option.isNone(found))
    return yield* new AppError({ status: 404, message: "This document is not public." });
  return found.value;
});

export const readPublicDocumentLink = Effect.fn("Public.documentLink")(function* (
  reference: PublicDocumentReference,
) {
  return publicDocumentPath(yield* findPublicDocument(reference));
});

export const readPublicDocument = Effect.fn("Public.document")(function* (
  reference: PublicDocumentReference,
) {
  const storage = yield* Storage;
  const found = yield* findPublicDocument(reference);
  const html = yield* storage.read(found.blobPath);
  if (Option.isNone(html))
    return yield* new AppError({ status: 404, message: "This document is unavailable." });
  // Recheck after storage IO so an unpublish during the download closes access.
  const current = yield* findPublicDocument({ id: found.id });
  yield* annotateTelemetry({
    document_id: found.id,
    ...(current.publicProjectId ? { project_id: current.publicProjectId } : {}),
  });
  return {
    document: {
      id: found.id,
      title: found.title,
      summary: found.summary,
      kind: found.kind,
      updatedAt: found.updatedAt,
      publicProjectId: current.publicProjectId,
      publicProjectName: current.publicProjectName,
    },
    publicPath: publicDocumentPath(current),
    html: html.value,
  };
});
