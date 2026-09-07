import { Effect } from "effect";
import {
  documentDetailSchema,
  documentSchema,
  librarySchema,
  projectInput,
  projectSchema,
  publishInput,
  publishResultSchema,
  documentPatch,
} from "@/lib/model";
import { decodeClient } from "../errors";
import { request } from "./request";

export const loadLibrary = request(librarySchema, "/api/library");
export const readReport = (id: string, version?: string) =>
  request(
    documentDetailSchema,
    `/api/documents/${encodeURIComponent(id)}${version ? `?revision=${encodeURIComponent(version)}` : ""}`,
  );
export const createProject = Effect.fn("Client.createProject")(function* (input: unknown) {
  const body = yield* decodeClient(projectInput, input);
  return yield* request(projectSchema, "/api/projects", { method: "POST", body });
});
export const publishReport = Effect.fn("Client.publishReport")(function* (input: unknown) {
  const body = yield* decodeClient(publishInput, input);
  return yield* request(publishResultSchema, "/api/documents", { method: "POST", body });
});
export const updateReport = Effect.fn("Client.updateReport")(function* (
  id: string,
  input: unknown,
) {
  const body = yield* decodeClient(documentPatch, input);
  return yield* request(documentSchema, `/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
});
