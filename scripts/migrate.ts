import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { getMigrations } from "better-auth/db/migration";
import { Auth, authCall } from "../src/server/auth";
import { databaseError, databaseLayer } from "../src/server/database";
import { AppConfig } from "../src/server/config";

const migrationLayer = Auth.layer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(AppConfig.layer),
);
const main = Effect.gen(function* () {
  const auth = yield* Auth;
  const sql = yield* SqlClient.SqlClient;
  const plan = yield* authCall(() => getMigrations(auth.options));
  yield* authCall(() => plan.runMigrations());
  yield* sql`CREATE TABLE IF NOT EXISTS project (
    id text PRIMARY KEY, "ownerId" text NOT NULL REFERENCES "user"(id), slug text NOT NULL,
    name text NOT NULL, description text NOT NULL, "createdAt" text NOT NULL, UNIQUE ("ownerId", slug)
  )`.pipe(databaseError("migrate project"));
  yield* sql`CREATE TABLE IF NOT EXISTS document (
    id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES project(id), slug text NOT NULL,
    title text NOT NULL, summary text NOT NULL, kind text NOT NULL CHECK (kind IN ('report','plan','reference')),
    tags jsonb NOT NULL, text text NOT NULL, revision integer NOT NULL, hash text NOT NULL,
    starred boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
    "createdAt" text NOT NULL, "updatedAt" text NOT NULL, UNIQUE ("projectId", slug)
  )`.pipe(databaseError("migrate document"));
  yield* sql`CREATE TABLE IF NOT EXISTS revision (
    id text PRIMARY KEY, "documentId" text NOT NULL REFERENCES document(id), version integer NOT NULL,
    "blobPath" text NOT NULL, hash text NOT NULL, bytes integer NOT NULL, author text NOT NULL,
    "createdAt" text NOT NULL, UNIQUE ("documentId", version)
  )`.pipe(databaseError("migrate revision"));
  yield* Console.log("Database migrations complete.");
}).pipe(
  Effect.provide(migrationLayer),
  Effect.catch(() =>
    Console.error("Migration failed. Check the database configuration.").pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);
BunRuntime.runMain(main, { disableErrorReporting: true });
