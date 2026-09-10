import { Effect, Schema } from "effect";
import { keyInput, deleteKeyInput } from "@/lib/model";
import { decodeClient } from "../errors";
import { request } from "./request";
import { observeAction } from "../observe-action";

const agentKeySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  start: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  metadata: Schema.NullOr(
    Schema.Struct({ projectIds: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))) }),
  ),
});
export type AgentKey = typeof agentKeySchema.Type;
const keysSchema = Schema.Struct({ apiKeys: Schema.Array(agentKeySchema) });
const createdKeySchema = Schema.Struct({ key: Schema.NonEmptyString });
const deletedKeySchema = Schema.Struct({ success: Schema.Boolean });

export const loadKeys = request(keysSchema, "/api/keys");
export const createAgentKey = Effect.fn("Client.createAgentKey")(function* (input: unknown) {
  const body = yield* decodeClient(keyInput, input);
  return yield* request(createdKeySchema, "/api/keys", { method: "POST", body }).pipe(
    observeAction("agent_key_create", {
      project_scoped: body.projectIds !== null,
      scope_count: body.projectIds?.length,
      write_access: body.write,
      expiration_days: body.days,
    }),
  );
});
export const revokeAgentKey = Effect.fn("Client.revokeAgentKey")(function* (keyId: string) {
  const body = yield* decodeClient(deleteKeyInput, { keyId });
  return yield* request(deletedKeySchema, "/api/keys", { method: "DELETE", body }).pipe(
    observeAction("agent_key_revoke"),
  );
});
