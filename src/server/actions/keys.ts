import { Effect } from "effect";
import { Auth, authCall } from "../auth";
import { ownerAccess } from "./access";
import { findProject } from "./projects";
import { AppError } from "../errors";
import type { keyInput, Principal } from "@/lib/model";
import { recordOperation } from "../observability";

export const listKeys = Effect.fn("Keys.list")(function* (principal: Principal, headers: Headers) {
  yield* ownerAccess(principal);
  const auth = yield* Auth;
  const result = yield* authCall(() => auth.api.listApiKeys({ headers }));
  // Expose display metadata only. Key hashes, counters, and internal permissions stay on the server.
  return {
    apiKeys: result.apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      start: key.start,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      metadata: key.metadata,
    })),
  };
});
export const createKey = Effect.fn("Keys.create")(function* (
  principal: Principal,
  input: typeof keyInput.Type,
) {
  yield* ownerAccess(principal);
  const auth = yield* Auth;
  let organizationId = principal.organizationId;
  if (input.projectIds) {
    const ids = [...new Set(input.projectIds)];
    if (!ids.length)
      return yield* new AppError({ status: 400, message: "Select a project you can access." });
    const projects = yield* Effect.forEach(ids, (id) =>
      findProject(principal, { id }, input.write),
    );
    const organizations = new Set(projects.map((project) => project.organizationId));
    if (organizations.size !== 1)
      return yield* new AppError({
        status: 400,
        message: "Select projects from one team for each agent key.",
      });
    organizationId = projects[0]!.organizationId;
  }
  const documentPermissions = ["read"];
  if (input.write) documentPermissions.push("write");
  if (input.share) documentPermissions.push("share");
  const created = yield* authCall(() =>
    auth.api.createApiKey({
      body: {
        userId: principal.ownerId,
        name: input.name,
        expiresIn: input.days * 86400,
        permissions: { documents: documentPermissions },
        metadata: { projectIds: input.projectIds, organizationId },
      },
    }),
  );
  yield* recordOperation("chronicon_agent_key_created", {
    write_access: input.write,
    share_access: input.share,
    project_scope_count: input.projectIds?.length ?? 0,
    all_projects: input.projectIds === null,
    expires_in_days: input.days,
  });
  return { key: created.key };
});
export const revokeKey = Effect.fn("Keys.revoke")(function* (
  principal: Principal,
  headers: Headers,
  keyId: string,
) {
  yield* ownerAccess(principal);
  const auth = yield* Auth;
  yield* authCall(() => auth.api.deleteApiKey({ headers, body: { keyId } }));
  yield* recordOperation("chronicon_agent_key_revoked");
  return { success: true };
});
