import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import type { AppConfig } from "../config";
import { databaseError } from "../database";

export const isOwnerEmail = (config: AppConfig["Service"], email: string) =>
  !!config.ownerEmail && email.trim().toLowerCase() === config.ownerEmail;

export const findOwnerEmail = Effect.fn("Owner.findEmail")(function* (id: string) {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ email: Schema.String }),
    execute: (id) => sql`SELECT email FROM "user" WHERE id = ${id}`,
  })(id).pipe(databaseError("find owner"));
});
