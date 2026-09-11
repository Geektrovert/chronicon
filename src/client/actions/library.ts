import { Effect } from "effect";
import {
  documentDetailSchema,
  documentUpdateResultSchema,
  librarySchema,
  projectInput,
  projectSchema,
  publishInput,
  publishResultSchema,
  documentPatch,
} from "@/lib/model";
import { decodeClient } from "../errors";
import { request } from "./request";
import { observeAction } from "../observe-action";

export const loadLibrary = request(librarySchema, "/api/library");
export const loadProjectLibrary = (projectId: string) =>
  request(librarySchema, `/api/library?projectId=${encodeURIComponent(projectId)}`).pipe(
    // A denied scope must discard its preserved pages and drafts. The server
    // then renders not-found, or the remaining document-only grant.
    Effect.tapError((error) =>
      error.status === 403 || error.status === 404
        ? Effect.sync(() => window.location.reload())
        : Effect.void,
    ),
  );
export const readReport = (id: string, version?: string) =>
  request(
    documentDetailSchema,
    `/api/documents/${encodeURIComponent(id)}${version ? `?revision=${encodeURIComponent(version)}` : ""}`,
  ).pipe(
    Effect.tapError((error) =>
      error.status === 403 || error.status === 404
        ? Effect.sync(() => window.location.reload())
        : Effect.void,
    ),
  );
export const createProject = Effect.fn("Client.createProject")(function* (input: unknown) {
  const body = yield* decodeClient(projectInput, input);
  return yield* request(projectSchema, "/api/projects", { method: "POST", body }).pipe(
    observeAction("project_create"),
  );
});
export const publishReport = Effect.fn("Client.publishReport")(function* (input: unknown) {
  const body = yield* decodeClient(publishInput, input);
  return yield* request(publishResultSchema, "/api/documents", { method: "POST", body }).pipe(
    observeAction("document_publish", {
      kind: body.kind,
      revision_publish: body.expectedRevision > 0,
      revision: body.expectedRevision,
      project_scoped: "id" in body.project,
      project_id: "id" in body.project ? body.project.id : undefined,
    }),
  );
});
export const updateReport = Effect.fn("Client.updateReport")(function* (
  id: string,
  input: unknown,
) {
  const body = yield* decodeClient(documentPatch, input);
  return yield* request(documentUpdateResultSchema, `/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  }).pipe(
    observeAction("document_update", {
      document_id: id,
      starred: body.starred,
      archived: body.archived,
    }),
  );
});
