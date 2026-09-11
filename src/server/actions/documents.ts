import { PgClient } from "@effect/sql-pg";
import { recordOperation } from "../observability";
import { Crypto, DateTime, Effect, Option, Ref, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { parseDocument } from "htmlparser2";
import {
  documentSchema,
  projectSchema,
  revisionSchema,
  revisionHistorySchema,
  repositoryAssociation,
  type documentPatch,
  type Document,
  type Principal,
  type PublishInput,
} from "@/lib/model";
import { AppConfig } from "../config";
import { databaseError } from "../database";
import { documentAccess, projectAccess, projectRole, ownerAccess } from "./access";
import { AppError, DatabaseError } from "../errors";
import { Storage } from "../services/storage";
import { hashJson } from "../services/hash";
import { invalidateLibrary } from "../cache";
import { findProject, resolvePublishProject } from "./projects";
import {
  documentSharingState,
  requireDocumentSharingRevision,
  updateDocumentSharing,
} from "./document-sharing";

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

export const findDocumentContext = Effect.fn("Library.findDocumentContext")(function* (
  principal: Principal,
  id: string,
  write = false,
) {
  const sql = yield* PgClient.PgClient;
  const lookupDocument = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: documentSchema,
    execute: (id) =>
      sql`SELECT d.*, EXISTS(SELECT 1 FROM document_star s WHERE s."documentId" = d.id AND s."userId" = ${principal.ownerId}) AS starred FROM document d WHERE d.id = ${id}`,
  });
  const lookupProjectById = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: projectSchema,
    execute: (id) => sql`SELECT * FROM project WHERE id = ${id}`,
  });
  const found = yield* lookupDocument(id).pipe(databaseError("find document"));
  if (Option.isNone(found))
    return yield* new AppError({
      status: 404,
      message: "Document not found. Check the document and account.",
    });
  const project = yield* lookupProjectById(found.value.projectId).pipe(
    databaseError("find document project"),
  );
  if (Option.isNone(project))
    return yield* new AppError({
      status: 404,
      message: "Document not found. Check the document and account.",
    });
  return {
    document: yield* documentAccess(principal, found.value, project.value, write),
    project: project.value,
  };
});

export const findDocument = Effect.fn("Library.findDocument")(function* (
  principal: Principal,
  id: string,
  write = false,
) {
  const { document, project } = yield* findDocumentContext(principal, id, write);
  const role = yield* projectRole(principal, project);
  return { document, project: role ? { ...project, accessRole: role } : null };
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
  const { document } = yield* findDocument(principal, id);
  const found = yield* lookupRevision({
    documentId: id,
    version: version ?? document.revision,
  }).pipe(databaseError("read revision"));
  if (Option.isNone(found))
    return yield* new AppError({
      status: 404,
      message: "Revision not found. Open the latest revision.",
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
                message: "This document's HTML is unavailable. Try another revision.",
              }),
            onSome: Effect.succeed,
          }),
        ),
      ),
    },
    { concurrency: "unbounded" },
  );
  // A download can outlast a permission change. Recheck before returning HTML
  // and use the current parent visibility to preserve document-only access.
  const current = yield* findDocumentContext(principal, id);
  const role = yield* projectRole(principal, current.project);
  const config = yield* AppConfig;
  return {
    document: {
      ...document,
      accessRole: current.document.accessRole,
      visibility: current.document.visibility,
      sharingRevision: current.document.sharingRevision,
      starred: current.document.starred,
      archived: current.document.archived,
    },
    project: role ? { ...current.project, accessRole: role } : null,
    sharing: yield* documentSharingState(config.origin, current.document, current.project),
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
      return yield* new AppError({
        status: 403,
        message: "This key is read-only. Create a key with Write access from Connect an agent.",
      });
    const config = yield* AppConfig;
    const sql = yield* PgClient.PgClient;
    const blobs = yield* Storage;
    const crypto = yield* Crypto.Crypto;
    const uuid = crypto.randomUUIDv4.pipe(Effect.orDie);
    const lookupCurrent = SqlSchema.findOneOption({
      Request: Schema.Struct({ projectId: Schema.String, slug: Schema.String }),
      Result: documentSchema,
      execute: ({ projectId, slug }) =>
        sql`SELECT d.*, EXISTS(SELECT 1 FROM document_star s WHERE s."documentId" = d.id AND s."userId" = ${principal.ownerId}) AS starred FROM document d WHERE d."projectId" = ${projectId} AND d.slug = ${slug}`,
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
              visibility: document.visibility,
              updatedAt: document.updatedAt,
            })} WHERE id = ${document.id} RETURNING *`
          : sql`INSERT INTO document ${sql.insert(document)} RETURNING *`,
    });
    const bytes = new TextEncoder().encode(input.html).byteLength;
    if (bytes > 2_000_000)
      return yield* new AppError({ status: 413, message: "Use an HTML file of 2 MB or less." });
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
          const target = yield* resolvePublishProject(
            principal,
            input.project,
            input.expectedRevision,
          );
          // Serializes revisions, including concurrent creation of a new document slug.
          yield* sql`SELECT id FROM project WHERE id = ${target.id} FOR UPDATE`.pipe(
            databaseError("lock project"),
          );
          // Ownership can change while this request waits for the project lock.
          const project = yield* resolvePublishProject(
            principal,
            { id: target.id },
            input.expectedRevision,
          );
          const found = yield* lookupCurrent({ projectId: project.id, slug: input.slug }).pipe(
            databaseError("find current revision"),
          );
          const current = Option.getOrUndefined(found);
          const role = current
            ? (yield* documentAccess(principal, current, project, true)).accessRole
            : (yield* projectAccess(principal, project, true)).accessRole;
          if (input.sharing)
            yield* requireDocumentSharingRevision(principal, current, project, input.sharing);
          const sharingChanged =
            input.sharing !== undefined && input.sharing.visibility !== current?.visibility;
          if (current?.hash === hash && !sharingChanged) {
            if (current.text !== text)
              yield* sql`UPDATE document SET text = ${text} WHERE id = ${current.id}`.pipe(
                databaseError("refresh searchable text"),
              );
            return {
              project,
              document: { ...current, text, accessRole: role },
              created: false,
              unchanged: true,
            };
          }
          if ((current?.revision ?? 0) !== input.expectedRevision)
            return yield* new AppError({
              status: 409,
              message: `This document is now at revision ${current?.revision ?? 0}. Read the latest revision and merge your changes before publishing.`,
            });
          if (current?.hash === hash && input.sharing) {
            const document = yield* updateDocumentSharing(
              principal,
              current,
              project,
              input.sharing,
            );
            return {
              project,
              document: { ...document, accessRole: role },
              created: false,
              unchanged: false,
            };
          }
          const path = yield* blobs.put(input.html);
          yield* Ref.set(uploaded, path);
          const now = DateTime.formatIso(yield* DateTime.now);
          const document: Document = {
            id: current?.id ?? (yield* uuid),
            projectId: project.id,
            visibility: input.sharing?.visibility ?? current?.visibility ?? "private",
            sharingRevision: current?.sharingRevision ?? 1,
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
          return {
            project,
            document: { ...saved, starred: current?.starred ?? false, accessRole: role },
            created: !current,
            unchanged: false,
          };
        }).pipe(
          Effect.flatMap((result) =>
            Effect.gen(function* () {
              const sharing = yield* documentSharingState(
                config.origin,
                result.document,
                result.project,
              );
              // Effect's commit failures are defects. Once commit starts, its outcome may be unknown.
              yield* Ref.set(committing, true);
              return { ...result, sharing };
            }),
          ),
        ),
      )
      .pipe(
        Effect.catchTag(
          "SqlError",
          () =>
            new AppError({
              status: 500,
              message:
                "Unable to confirm publishing. Read the document's current revision before trying again.",
            }),
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
    const projectPermission = yield* projectRole(principal, result.project);
    return {
      ...result,
      project: projectPermission ? { ...result.project, accessRole: projectPermission } : null,
      association: projectPermission
        ? repositoryAssociation(config.origin, principal.ownerId, result.project)
        : null,
      url: `${config.origin}/documents/${result.document.id}`,
    };
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.tap((result) =>
        recordOperation("chronicon_document_published", {
          document_id: result.document.id,
          project_id: result.document.projectId,
          revision: result.document.revision,
          created: result.created,
          unchanged: result.unchanged,
          visibility: result.sharing.visibility,
          sharing_revision: result.sharing.revision,
        }),
      ),
      Effect.uninterruptible,
    ),
);

export const updateDocument = Effect.fn("Library.update")(
  function* (principal: Principal, id: string, patch: typeof documentPatch.Type) {
    const sql = yield* PgClient.PgClient;
    const config = yield* AppConfig;
    if (patch.starred !== undefined || patch.archived !== undefined) yield* ownerAccess(principal);
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`SELECT p.id FROM project p JOIN document d ON d."projectId" = p.id WHERE d.id = ${id} FOR UPDATE OF p`.pipe(
            databaseError("lock document project"),
          );
          const current = yield* findDocumentContext(
            principal,
            id,
            patch.archived !== undefined || patch.sharing !== undefined,
          );
          if (patch.sharing)
            yield* updateDocumentSharing(
              principal,
              current.document,
              current.project,
              patch.sharing,
            );
          if (patch.starred === true)
            yield* sql`INSERT INTO document_star ("documentId", "userId") VALUES (${id}, ${principal.ownerId}) ON CONFLICT DO NOTHING`.pipe(
              databaseError("star document"),
            );
          else if (patch.starred === false)
            yield* sql`DELETE FROM document_star WHERE "documentId" = ${id} AND "userId" = ${principal.ownerId}`.pipe(
              databaseError("unstar document"),
            );
          if (patch.archived !== undefined)
            yield* sql`UPDATE document SET archived = ${patch.archived} WHERE id = ${id}`.pipe(
              databaseError("archive document"),
            );
          const { document, project } = yield* findDocumentContext(principal, id);
          return {
            ...document,
            sharing: yield* documentSharingState(config.origin, document, project),
          };
        }),
      )
      .pipe(Effect.catchTag("SqlError", () => new DatabaseError({ operation: "update document" })));
  },
  (effect, principal) =>
    effect.pipe(
      Effect.tap(() => invalidateLibrary(principal.ownerId)),
      Effect.tap((result) =>
        recordOperation("chronicon_document_updated", {
          document_id: result.id,
          project_id: result.projectId,
          starred: result.starred,
          archived: result.archived,
          visibility: result.sharing.visibility,
          sharing_revision: result.sharing.revision,
        }),
      ),
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
    return yield* new AppError({
      status: 404,
      message: "Document not found. Check the document and account.",
    });
  return yield* readDocument(principal, found.value.id, input.revision);
});
