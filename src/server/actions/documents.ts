import { PgClient } from "@effect/sql-pg";
import { Crypto, DateTime, Effect, Option, Ref, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { parseDocument } from "htmlparser2";
import {
  documentSchema,
  projectSchema,
  revisionSchema,
  revisionHistorySchema,
  type Document,
  type Principal,
  type PublishInput,
} from "@/lib/model";
import { AppConfig } from "../config";
import { databaseError } from "../database";
import { projectAccess, ownerAccess } from "./access";
import { AppError } from "../errors";
import { Storage } from "../services/storage";
import { hashJson } from "../services/hash";
import { invalidateLibrary } from "../cache";
import { findProject, resolvePublishProject } from "./projects";

const textBoundaryTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "br",
  "caption",
  "center",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function extractText(html: string) {
  const tree = parseDocument(html);
  // Keep deeply nested uploads off the call stack.
  const pending: Array<(typeof tree.children)[number] | " "> = [tree];
  const parts: string[] = [];
  while (pending.length) {
    const node = pending.pop();
    if (node === undefined) break;
    if (node === " ") {
      parts.push(node);
      continue;
    }
    if (node.type === "text") {
      parts.push(node.data);
      continue;
    }
    if (!("children" in node)) continue;
    if ("name" in node) {
      if (["script", "style", "noscript", "template", "svg"].includes(node.name)) continue;
      // Inline elements may split a word; only semantic blocks need separators.
      if (textBoundaryTags.has(node.name)) {
        parts.push(" ");
        pending.push(" ");
      }
    }
    for (let index = node.children.length - 1; index >= 0; index--)
      pending.push(node.children[index]);
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

const findDocument = Effect.fn("Library.findDocument")(function* (
  principal: Principal,
  id: string,
  write = false,
) {
  const sql = yield* PgClient.PgClient;
  const lookupDocument = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: documentSchema,
    execute: (id) => sql`SELECT * FROM document WHERE id = ${id}`,
  });
  const lookupProjectById = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: projectSchema,
    execute: (id) => sql`SELECT * FROM project WHERE id = ${id}`,
  });
  const found = yield* lookupDocument(id).pipe(databaseError("find document"));
  if (Option.isNone(found))
    return yield* new AppError({ status: 404, message: "This report could not be found." });
  const project = yield* lookupProjectById(found.value.projectId).pipe(
    databaseError("find document project"),
  );
  return {
    document: found.value,
    project: yield* projectAccess(principal, Option.getOrUndefined(project), write),
  };
});

export const readDocument = Effect.fn("Library.read")(function* (
  principal: Principal,
  id: string,
  version?: number,
) {
  const sql = yield* PgClient.PgClient;
  const blobs = yield* Storage;
  const lookupRevision = SqlSchema.findOneOption({
    Request: Schema.Struct({ documentId: Schema.String, version: Schema.Int }),
    Result: revisionSchema,
    execute: ({ documentId, version }) =>
      sql`SELECT * FROM revision WHERE "documentId" = ${documentId} AND version = ${version}`,
  });
  const readHistory = SqlSchema.findAll({
    Request: Schema.String,
    Result: revisionHistorySchema,
    execute: (id) =>
      sql`SELECT id, version, bytes, author, "createdAt" FROM revision WHERE "documentId" = ${id} ORDER BY version DESC`,
  });
  const { document, project } = yield* findDocument(principal, id);
  const found = yield* lookupRevision({
    documentId: id,
    version: version ?? document.revision,
  }).pipe(databaseError("read revision"));
  if (Option.isNone(found))
    return yield* new AppError({
      status: 404,
      message: "This revision could not be found. Open the latest revision.",
    });
  const revision = found.value;
  const result = yield* Effect.all(
    {
      history: readHistory(id).pipe(databaseError("revision history")),
      html: blobs.read(revision.blobPath).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              new AppError({
                status: 404,
                message: "The report file is unavailable. Try another revision.",
              }),
            onSome: Effect.succeed,
          }),
        ),
      ),
    },
    { concurrency: "unbounded" },
  );
  return {
    document,
    project,
    ...result,
    revision: {
      version: revision.version,
      bytes: revision.bytes,
      author: revision.author,
      createdAt: revision.createdAt,
    },
  };
});

export const publishDocument = Effect.fn("Library.publish")(
  function* (principal: Principal, input: PublishInput) {
    if (!principal.canWrite)
      return yield* new AppError({ status: 403, message: "This agent key has read-only access." });
    const config = yield* AppConfig;
    const sql = yield* PgClient.PgClient;
    const blobs = yield* Storage;
    const crypto = yield* Crypto.Crypto;
    const uuid = crypto.randomUUIDv4.pipe(Effect.orDie);
    const lookupCurrent = SqlSchema.findOneOption({
      Request: Schema.Struct({ projectId: Schema.String, slug: Schema.String }),
      Result: documentSchema,
      execute: ({ projectId, slug }) =>
        sql`SELECT * FROM document WHERE "projectId" = ${projectId} AND slug = ${slug}`,
    });
    const saveDocument = SqlSchema.findOne({
      Request: Schema.Struct({
        document: Schema.Struct({
          ...documentSchema.fields,
          // pg binds raw arrays as PostgreSQL arrays, so encode JSONB explicitly.
          tags: Schema.fromJsonString(documentSchema.fields.tags),
        }),
        existing: Schema.Boolean,
      }),
      Result: documentSchema,
      execute: ({ document, existing }) =>
        existing
          ? sql`UPDATE document SET ${sql.update({
              title: document.title,
              summary: document.summary,
              kind: document.kind,
              tags: document.tags,
              text: document.text,
              revision: document.revision,
              hash: document.hash,
              updatedAt: document.updatedAt,
            })} WHERE id = ${document.id} RETURNING *`
          : sql`INSERT INTO document ${sql.insert(document)} RETURNING *`,
    });
    const bytes = new TextEncoder().encode(input.html).byteLength;
    if (bytes > 2_000_000)
      return yield* new AppError({ status: 413, message: "Keep each HTML file under 2 MB." });
    const text = extractText(input.html);
    const hash = yield* hashJson({
      html: input.html,
      title: input.title,
      summary: input.summary,
      kind: input.kind,
      tags: input.tags,
    }).pipe(Effect.orDie);
    const uploaded = yield* Ref.make<string | undefined>(undefined);
    const committing = yield* Ref.make(false);
    const result = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const project = yield* resolvePublishProject(
            principal,
            input.project,
            input.expectedRevision,
          );
          // Serializes revisions, including concurrent creation of a new document slug.
          yield* sql`SELECT id FROM project WHERE id = ${project.id} FOR UPDATE`.pipe(
            databaseError("lock project"),
          );
          const found = yield* lookupCurrent({ projectId: project.id, slug: input.slug }).pipe(
            databaseError("find current revision"),
          );
          const current = Option.getOrUndefined(found);
          if (current?.hash === hash) {
            if (current.text !== text)
              yield* sql`UPDATE document SET text = ${text} WHERE id = ${current.id}`.pipe(
                databaseError("refresh searchable text"),
              );
            return { project, document: { ...current, text }, created: false, unchanged: true };
          }
          if ((current?.revision ?? 0) !== input.expectedRevision)
            return yield* new AppError({
              status: 409,
              message: `This report is now at revision ${current?.revision ?? 0}. Reload it before publishing your update.`,
            });
          const path = yield* blobs.put(input.html);
          yield* Ref.set(uploaded, path);
          const now = DateTime.formatIso(yield* DateTime.now);
          const document: Document = {
            id: current?.id ?? (yield* uuid),
            projectId: project.id,
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            kind: input.kind,
            tags: input.tags,
            text,
            revision: (current?.revision ?? 0) + 1,
            hash,
            starred: current?.starred ?? false,
            archived: current?.archived ?? false,
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
          };
          const saved = yield* saveDocument({ document, existing: !!current }).pipe(
            databaseError("save document"),
          );
          const revision = {
            id: yield* uuid,
            documentId: document.id,
            version: document.revision,
            blobPath: path,
            hash,
            bytes,
            author: principal.name,
            createdAt: now,
          };
          yield* sql`INSERT INTO revision ${sql.insert(revision)}`.pipe(
            databaseError("record revision"),
          );
          // Effect's commit failures are defects. Once commit starts, its outcome may be unknown.
          yield* Ref.set(committing, true);
          return { project, document: saved, created: !current, unchanged: false };
        }),
      )
      .pipe(
        Effect.catchTag(
          "SqlError",
          () => new AppError({ status: 500, message: "Unable to publish this report. Try again." }),
        ),
        Effect.onError(() =>
          Effect.gen(function* () {
            if (yield* Ref.get(committing)) return;
            const path = yield* Ref.get(uploaded);
            if (path)
              yield* blobs
                .remove(path)
                .pipe(
                  Effect.catch(() => Effect.logError("Could not remove an uncommitted upload.")),
                );
          }),
        ),
        Effect.uninterruptible,
      );
    return {
      ...result,
      association: {
        version: 1,
        server: config.origin,
        workspaceId: principal.ownerId,
        projectId: result.project.id,
        projectSlug: result.project.slug,
      },
      url: `${config.origin}/documents/${result.document.id}`,
    };
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.uninterruptible,
    ),
);

export const updateDocument = Effect.fn("Library.update")(
  function* (principal: Principal, id: string, patch: { starred?: boolean; archived?: boolean }) {
    const sql = yield* PgClient.PgClient;
    const patchDocument = SqlSchema.findOne({
      Request: Schema.Struct({
        id: Schema.String,
        starred: Schema.optionalKey(Schema.Boolean),
        archived: Schema.optionalKey(Schema.Boolean),
      }),
      Result: documentSchema,
      execute: ({ id, ...patch }) =>
        sql`UPDATE document SET ${sql.update(patch)} WHERE id = ${id} RETURNING *`,
    });
    yield* ownerAccess(principal);
    yield* findDocument(principal, id, true);
    return yield* patchDocument({ id, ...patch }).pipe(databaseError("update document flags"));
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.uninterruptible,
    ),
);

export const readDocumentByReference = Effect.fn("Library.readByReference")(function* (
  principal: Principal,
  input:
    | { readonly id: string; readonly revision?: number }
    | {
        readonly project: { readonly id: string } | { readonly slug: string };
        readonly slug: string;
        readonly revision?: number;
      },
) {
  if ("id" in input) return yield* readDocument(principal, input.id, input.revision);
  const project = yield* findProject(principal, input.project);
  const sql = yield* PgClient.PgClient;
  const lookup = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: documentSchema,
    execute: (slug) =>
      sql`SELECT * FROM document WHERE "projectId" = ${project.id} AND slug = ${slug}`,
  });
  const found = yield* lookup(input.slug).pipe(databaseError("find document by slug"));
  if (Option.isNone(found))
    return yield* new AppError({ status: 404, message: "This report could not be found." });
  return yield* readDocument(principal, found.value.id, input.revision);
});
