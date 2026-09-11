import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import {
  documentSchema,
  type documentSharingInput,
  type Document,
  type Principal,
  type Project,
} from "@/lib/model";
import { databaseError } from "../database";
import { AppError } from "../errors";
import { requireDocumentSharing } from "./access";
import { documentPublicPath } from "./public-links";

export const documentSharingState = Effect.fn("Sharing.documentState")(function* (
  origin: string,
  document: Document,
  project: Project,
) {
  const inheritedPublic = project.visibility === "public";

  return {
    visibility: document.visibility,
    revision: document.sharingRevision,
    inheritedPublic,
    publicUrl:
      !document.archived && (document.visibility === "public" || inheritedPublic)
        ? `${origin}${yield* documentPublicPath(document.id)}`
        : null,
  };
});

// Call inside the document's project transaction, after locking and re-reading access.
// Sharing revisions describe direct link access, independently of HTML history and grants.
export const requireDocumentSharingRevision = Effect.fn("Sharing.requireDocumentRevision")(
  function* (
    principal: Principal,
    document: Document | undefined,
    project: Project,
    input: typeof documentSharingInput.Type,
  ) {
    yield* requireDocumentSharing(principal, document, project);
    const revision = document?.sharingRevision ?? 0;

    if (input.expectedRevision !== revision)
      return yield* new AppError({
        status: 409,
        message: `Document sharing is now at revision ${revision}. Read the document's sharing settings before changing access.`,
      });
  },
);

export const updateDocumentSharing = Effect.fn("Sharing.updateDocument")(function* (
  principal: Principal,
  document: Document,
  project: Project,
  input: typeof documentSharingInput.Type,
) {
  yield* requireDocumentSharingRevision(principal, document, project, input);

  if (input.visibility === document.visibility) return document;
  const sql = yield* PgClient.PgClient;

  const saved = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: documentSchema,
    execute: () =>
      sql`UPDATE document SET visibility = ${input.visibility}
          WHERE id = ${document.id} AND "sharingRevision" = ${input.expectedRevision} RETURNING *`,
  })(undefined).pipe(databaseError("update document sharing"));

  if (Option.isNone(saved))
    return yield* new AppError({
      status: 409,
      message: "Document sharing changed. Read the document before changing access.",
    });

  return { ...saved.value, starred: document.starred, accessRole: document.accessRole };
});
