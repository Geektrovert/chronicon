import { Crypto, Effect, Encoding, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { cliAuthorization, cliExchange } from "@/lib/cli-auth";
import type { Principal } from "@/lib/model";
import { Auth, authCall } from "../auth";
import { AppConfig } from "../config";
import { databaseError } from "../database";
import { AppError } from "../errors";
import { ownerAccess } from "./access";

const digest = (value: string) =>
  Crypto.Crypto.use((crypto) => crypto.digest("SHA-256", new TextEncoder().encode(value))).pipe(
    Effect.map(Encoding.encodeBase64Url),
    Effect.orDie,
  );

export const approveCli = Effect.fn("Cli.approve")(function* (
  principal: Principal,
  input: typeof cliAuthorization.Type,
) {
  yield* ownerAccess(principal);
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const code = Encoding.encodeBase64Url(yield* crypto.randomBytes(32).pipe(Effect.orDie));
  const codeHash = yield* digest(code);
  yield* sql.withTransaction(
    Effect.gen(function* () {
      // Bound outstanding approvals per account and serialize concurrent approvals.
      yield* sql`SELECT id FROM "user" WHERE id = ${principal.ownerId} FOR UPDATE`;
      yield* sql`DELETE FROM cli_authorization WHERE "expiresAt" < now()`;
      const active =
        yield* sql`SELECT "codeHash" FROM cli_authorization WHERE "userId" = ${principal.ownerId}`;
      if (active.length >= 5)
        return yield* new AppError({
          status: 429,
          message: "Too many pending logins. Try again in five minutes.",
        });
      yield* sql`INSERT INTO cli_authorization ("codeHash", "userId", "redirectUri", challenge, "expiresAt")
        VALUES (${codeHash}, ${principal.ownerId}, ${input.redirectUri}, ${input.challenge}, now() + interval '5 minutes')`;
    }).pipe(
      Effect.catchTag(
        "SqlError",
        () => new AppError({ status: 500, message: "Unable to authorize the CLI. Try again." }),
      ),
    ),
  );
  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", input.state);
  return { redirect: redirect.href };
});

export const exchangeCli = Effect.fn("Cli.exchange")(function* (input: typeof cliExchange.Type) {
  const sql = yield* SqlClient.SqlClient;
  const auth = yield* Auth;
  const config = yield* AppConfig;
  const codeHash = yield* digest(input.code);
  const challenge = yield* digest(input.verifier);
  const grant = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ userId: Schema.String }),
    execute: () => sql`DELETE FROM cli_authorization
        WHERE "codeHash" = ${codeHash} AND "redirectUri" = ${input.redirectUri}
        AND challenge = ${challenge} AND "expiresAt" > now() RETURNING "userId"`,
  })(undefined).pipe(databaseError("redeem CLI authorization"));
  if (Option.isNone(grant))
    return yield* new AppError({
      status: 400,
      message: "This login has expired or was already used. Run login again.",
    });
  // Consume the grant before issuing a key so retries cannot create duplicate credentials.
  const key = yield* authCall(() =>
    auth.api.createApiKey({
      body: {
        userId: grant.value.userId,
        name: "Chronicon CLI",
        expiresIn: 30 * 86400,
        permissions: { documents: ["read", "write"] },
        metadata: { projectIds: null },
      },
    }),
  );
  return {
    server: config.origin,
    workspaceId: grant.value.userId,
    key: key.key,
    keyId: key.id,
    expiresAt: key.expiresAt,
  };
}, Effect.uninterruptible);

export const revokeCli = Effect.fn("Cli.revoke")(function* (principal: Principal) {
  if (principal.access !== "agent" || !principal.keyId)
    return yield* new AppError({ status: 403, message: "Use the CLI credential to sign out." });
  const sql = yield* SqlClient.SqlClient;
  // API keys use Better Auth's database storage, without a secondary key cache.
  yield* sql`DELETE FROM apikey WHERE id = ${principal.keyId} AND "referenceId" = ${principal.ownerId}`.pipe(
    databaseError("revoke CLI key"),
  );
  return { success: true };
});
