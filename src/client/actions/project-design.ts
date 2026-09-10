import { Effect } from "effect";
import { designDetail, updateDesignBody } from "@/lib/project-design/model";
import { decodeClient } from "../errors";
import { request } from "./request";
import { observeAction } from "../observe-action";

export const loadProjectDesign = (projectId: string) =>
  request(designDetail, `/api/projects/${encodeURIComponent(projectId)}/design`);
export const saveProjectDesign = Effect.fn("Client.saveProjectDesign")(function* (
  projectId: string,
  input: unknown,
) {
  const body = yield* decodeClient(updateDesignBody, input);
  return yield* request(designDetail, `/api/projects/${encodeURIComponent(projectId)}/design`, {
    method: "PUT",
    body,
  }).pipe(
    observeAction("project_design_save", {
      project_id: projectId,
      revision: body.expectedRevision,
    }),
  );
});
