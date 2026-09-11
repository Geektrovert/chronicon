import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { publicProfileSchema, type Principal, type publicProfileInput } from "@/lib/model";
import { databaseError } from "../database";
import { AppError, DatabaseError, deny } from "../errors";
import { ownerAccess } from "./access";

const reservedUsernames = new Set([
  "api",
  "public",
  "documents",
  "projects",
  "settings",
  "sign-in",
  "sign-up",
  "cli",
  "invitations",
  "starred",
  "archive",
  "admin",
  "support",
  "chronicon",
]);

export const readPublicProfile = Effect.fn("Profile.read")(function* (principal: Principal) {
  yield* ownerAccess(principal);
  const sql = yield* PgClient.PgClient;
  const profile = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: publicProfileSchema,
    execute: (id) => sql`SELECT username, revision FROM public_profile WHERE "userId" = ${id}`,
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
  input: typeof publicProfileInput.Type,
) {
  yield* ownerAccess(principal);
  if (!principal.emailVerified)
    return yield* deny("Verify your email before choosing a public username.");
  if (reservedUsernames.has(input.username))
    return yield* new AppError({
      status: 409,
      message: "That username is reserved. Choose another.",
    });
  const sql = yield* PgClient.PgClient;
  return yield* sql
    .withTransaction(
      Effect.gen(function* () {
        yield* sql`SELECT "userId" FROM public_profile WHERE "userId" = ${principal.ownerId} FOR UPDATE`;
        const current = yield* readPublicProfile(principal);
        if (current.revision !== input.expectedRevision)
          return yield* new AppError({
            status: 409,
            message: "Your username changed. Reload settings before saving.",
          });
        if (current.username === input.username) return current;
        yield* sql`INSERT INTO public_username (username, "userId") VALUES (${input.username}, ${principal.ownerId})
      ON CONFLICT DO NOTHING`;
        const owned = yield* sql`SELECT username FROM public_username
      WHERE username = ${input.username} AND "userId" = ${principal.ownerId}`;
        if (!owned.length)
          return yield* new AppError({
            status: 409,
            message: "That username is taken. Choose another.",
          });
        yield* sql`UPDATE public_profile SET username = ${input.username}, revision = revision + 1
      WHERE "userId" = ${principal.ownerId}`;
        return { username: input.username, revision: current.revision + 1 };
      }),
    )
    .pipe(
      Effect.catchTag("SqlError", () => new DatabaseError({ operation: "save public profile" })),
    );
});
