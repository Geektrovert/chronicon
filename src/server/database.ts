import { PgClient } from "@effect/sql-pg";
import { Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";
import { AppConfig } from "./config";
import { DatabaseError } from "./errors";
import { logOperationalError } from "./observability";

// pg removes failed idle connections. Keep its event out of the uncaught-error path.
function onPoolError() {
  logOperationalError("An idle database connection closed.");
}

export class DatabasePool extends Context.Service<DatabasePool, Pool>()("chronicon/DatabasePool") {
  static readonly layer = Layer.effect(
    DatabasePool,
    Effect.gen(function* () {
      const config = yield* AppConfig;

      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          const pool = new Pool({
            connectionString: Redacted.value(config.databaseUrl),
            max: 3,
            idleTimeoutMillis: 20_000,
            connectionTimeoutMillis: 10_000,
            application_name: "chronicon",
          });

          pool.on("error", onPoolError);

          return pool;
        }),
        (pool) =>
          Effect.tryPromise(() => pool.end()).pipe(
            Effect.catch(() => Effect.logError("Database pool close failed.")),
          ),
      );
    }),
  );
}

export const databaseLayer = PgClient.layerFrom(
  DatabasePool.use((pool) =>
    PgClient.fromPool({
      acquire: Effect.succeed(pool),
      applicationName: "chronicon",
    }).pipe(Effect.mapError(() => new DatabaseError({ operation: "connect" }))),
  ),
).pipe(Layer.provideMerge(DatabasePool.layer));

export const databaseError = (operation: string) =>
  Effect.mapError(() => new DatabaseError({ operation }));
