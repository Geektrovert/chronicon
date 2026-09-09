import { Context, Effect, Layer, Redacted } from "effect";
import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import { AppConfig } from "./config";
import { DatabasePool } from "./database";
import { AppError, AuthenticationError } from "./errors";

function makeAuth(config: AppConfig["Service"], pool: Pool) {
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
      disableSignUp: false,
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
      const pool = yield* DatabasePool;
      return yield* Effect.try({
        try: () => makeAuth(config, pool),
        catch: () => new AuthenticationError(),
      });
    }),
  );
}
