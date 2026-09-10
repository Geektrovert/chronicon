import { Crypto, DateTime, Effect, Redacted, Schema } from "effect";
import { hashPassword } from "better-auth/crypto";
import { SqlClient } from "effect/unstable/sql";
import { AppConfig, ownerEmailSchema } from "../../src/server/config";
import { databaseError } from "../../src/server/database";

export class OwnerSetupError extends Schema.TaggedError<OwnerSetupError>()("OwnerSetupError", {
  message: Schema.String,
}) {}
export const passwordSchema = Schema.String.check(Schema.isMinLength(12), Schema.isMaxLength(128));
export const configuredOwnerEmail = Effect.gen(function* () {
  const config = yield* AppConfig;
  return yield* Schema.decodeEffect(ownerEmailSchema)(config.ownerEmail).pipe(
    Effect.mapError(
      () =>
        new OwnerSetupError({
          message: "Set OWNER_EMAIL to a valid email address in .env.local.",
        }),
    ),
  );
});
export const requireEmptyWorkspace = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const users = yield* sql`SELECT id FROM "user" LIMIT 1`.pipe(databaseError("check owner"));
  if (users.length)
    return yield* new OwnerSetupError({
      message:
        "An account already exists. Sign in through the browser or choose Create account to add another. No account or password was changed.",
    });
});

// Only local scripts import this module. Neither signup routes nor app services provision users.
export const provisionOwner = Effect.fn("Owner.provision")(function* (
  password: Redacted.Redacted<string>,
) {
  const sql = yield* SqlClient.SqlClient;
  const email = yield* configuredOwnerEmail;
  const uuid = (yield* Crypto.Crypto).randomUUIDv4.pipe(Effect.orDie);
  yield* Schema.decodeEffect(passwordSchema)(Redacted.value(password)).pipe(
    Effect.mapError(
      () => new OwnerSetupError({ message: "Use a password between 12 and 128 characters." }),
    ),
  );
  yield* requireEmptyWorkspace;
  const passwordHash = yield* Effect.tryPromise({
    try: () => hashPassword(Redacted.value(password)),
    catch: () =>
      new OwnerSetupError({ message: "Unable to hash the password. No account was created." }),
  });
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE`.pipe(
        databaseError("lock owner setup"),
      );
      yield* requireEmptyWorkspace;
      const id = yield* uuid;
      const accountId = yield* uuid;
      const now = DateTime.toDateUtc(yield* DateTime.now);
      yield* sql`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${id}, 'Owner', ${email}, false, ${now}, ${now})`.pipe(databaseError("create owner"));
      yield* sql`INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${accountId}, ${id}, 'credential', ${id}, ${passwordHash}, ${now}, ${now})`.pipe(
        databaseError("create credential"),
      );
      return { id, email };
    }),
  );
});
