import { Context, Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import { AppConfig } from "./config";
import { DatabasePool } from "./database";
import { findOwnerEmail, isOwnerEmail } from "./actions/owner";
import { AppError, AuthenticationError } from "./errors";

// Promise conversion here is a Better Auth hook boundary, not an application workflow.
function makeAuth(config: AppConfig["Service"], pool: Pool, sql: SqlClient.SqlClient) {
  const forbidden = () => new APIError("FORBIDDEN", { message: "This workspace is private." });
  const verifyOwner = Effect.fn("Auth.verifyOwner")(
    function* (userId: string) {
      const user = yield* findOwnerEmail(userId).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
      );
      if (!Option.exists(user, (user) => isOwnerEmail(config, user.email)))
        return yield* Effect.fail(forbidden());
    },
    Effect.mapError(() => forbidden()),
  );
  return betterAuth({
    appName: "Chronicon",
    logger: { disabled: true },
    baseURL: config.baseUrl,
    secret: Redacted.value(config.authSecret) || undefined,
    database: pool,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: true,
    },
    databaseHooks: {
      user: {
        create: { before: () => Effect.runPromise(Effect.fail(forbidden())) },
        update: {
          before: (user) =>
            Effect.runPromise(
              user.email && !isOwnerEmail(config, user.email)
                ? Effect.fail(forbidden())
                : Effect.void,
            ),
        },
      },
      session: { create: { before: (session) => Effect.runPromise(verifyOwner(session.userId)) } },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" },
    plugins: [
      apiKey({
        defaultPrefix: "chronicon_",
        enableMetadata: true,
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
        permissions: { defaultPermissions: { documents: ["read"] } },
      }),
    ],
  });
}
export const authCall = <A>(work: () => Promise<A>) =>
  Effect.tryPromise({
    try: work,
    catch: (error) =>
      error instanceof APIError
        ? new AppError({
            status: error.statusCode,
            message:
              error.statusCode < 500 ? error.message : "Authentication is unavailable. Try again.",
          })
        : new AuthenticationError(),
  });
export class Auth extends Context.Service<Auth, ReturnType<typeof makeAuth>>()(
  "chronicon/server/Auth",
) {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const sql = yield* SqlClient.SqlClient;
      const pool = yield* DatabasePool;
      return yield* Effect.try({
        try: () => makeAuth(config, pool, sql),
        catch: () => new AuthenticationError(),
      });
    }),
  );
}
