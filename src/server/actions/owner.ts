import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { databaseError } from "../database";

export const findOwnerEmail = Effect.fn("Owner.findEmail")(function* (id: string) {
  const sql = yield* SqlClient.SqlClient;

  return yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({
      email: Schema.String,
      emailVerified: Schema.Boolean,
      banned: Schema.Boolean,
    }),
    execute: (id) =>
      sql`SELECT email, "emailVerified", COALESCE(banned, false) AS banned FROM "user" WHERE id = ${id}`,
  })(id).pipe(databaseError("find owner"));
});
