import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { publicProfileSchema, type Principal, type publicProfileInput } from "@/lib/model";
import { databaseError } from "../database";
import { AppError, deny } from "../errors";
import { Auth, authCall } from "../auth";
import { ownerAccess } from "./access";

export const readPublicProfile = Effect.fn("Profile.read")(function* (principal: Principal) {
  yield* ownerAccess(principal);
  const sql = yield* PgClient.PgClient;

  const profile = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: publicProfileSchema,
    execute: (id) =>
      sql`SELECT username, "usernameRevision" AS revision FROM "user" WHERE id = ${id}`,
  })(principal.ownerId).pipe(databaseError("read public profile"));

  if (Option.isNone(profile))
    return yield* new AppError({
      status: 404,
      message: "Your public profile is unavailable. Reload settings.",
    });

  return profile.value;
});

export const updatePublicProfile = Effect.fn("Profile.update")(function* (
  principal: Principal,
  headers: Headers,
  input: typeof publicProfileInput.Type,
) {
  yield* ownerAccess(principal);

  if (!principal.emailVerified)
    return yield* deny("Verify your email before choosing a public username.");
  const auth = yield* Auth;
  const conditionalHeaders = new Headers(headers);
  conditionalHeaders.set("if-match", `"username-${input.expectedRevision}"`);
  yield* authCall(() =>
    auth.api.updateUser({ headers: conditionalHeaders, body: { username: input.username } }),
  );

  return yield* readPublicProfile(principal);
});
