import { Effect } from "effect";
import { Auth, authCall } from "../auth";
import { SqlClient } from "effect/unstable/sql";
import { databaseError } from "../database";
import { ownerAccess } from "./access";
import { AppError } from "../errors";
import type { keyInput, Principal } from "@/lib/model";

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
  const sql = yield* SqlClient.SqlClient;
  const auth = yield* Auth;
  if (input.projectIds) {
    const ids = input.projectIds;
    const projects = ids.length
      ? yield* sql`SELECT id FROM project WHERE "ownerId" = ${principal.ownerId}
          AND ${sql.in("id", ids)}`.pipe(databaseError("validate key projects"))
      : [];
    if (!projects.length || projects.length !== new Set(ids).size)
      return yield* new AppError({ status: 400, message: "Select one of your projects." });
  }
  const created = yield* authCall(() =>
    auth.api.createApiKey({
      body: {
        userId: principal.ownerId,
        name: input.name,
        expiresIn: input.days * 86400,
        permissions: { documents: input.write ? ["read", "write"] : ["read"] },
        metadata: { projectIds: input.projectIds },
      },
    }),
  );
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
  return { success: true };
});
