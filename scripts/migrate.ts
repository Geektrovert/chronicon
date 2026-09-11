import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { getMigrations } from "better-auth/db/migration";
import { Auth, authCall } from "../src/server/auth";
import { databaseError, databaseLayer } from "../src/server/database";
import { AppConfig } from "../src/server/config";
import { EmailDelivery } from "../src/server/services/email";
import { teamMembershipMigration } from "./lib/team-membership-migration";
import { publicLinksMigration } from "./lib/public-links-migration";

const migrationLayer = Auth.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(databaseLayer, EmailDelivery.layer)),
  Layer.provideMerge(AppConfig.layer),
);
const main = Effect.gen(function* () {
  const auth = yield* Auth;
  const sql = yield* SqlClient.SqlClient;
  const plan = yield* authCall(() => getMigrations(auth.options));
  yield* authCall(() => plan.runMigrations());
  yield* sql`CREATE TABLE IF NOT EXISTS cli_authorization (
    "codeHash" text PRIMARY KEY, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "redirectUri" text NOT NULL, challenge text NOT NULL, "expiresAt" timestamptz NOT NULL
  )`.pipe(databaseError("migrate CLI authorization"));
  yield* sql`CREATE INDEX IF NOT EXISTS cli_authorization_expiry ON cli_authorization ("expiresAt")`.pipe(
    databaseError("index CLI authorization expiry"),
  );
  yield* sql`CREATE INDEX IF NOT EXISTS cli_authorization_user ON cli_authorization ("userId")`.pipe(
    databaseError("index CLI authorization account"),
  );
  yield* sql`CREATE TABLE IF NOT EXISTS project (
    id text PRIMARY KEY, "ownerId" text NOT NULL REFERENCES "user"(id), slug text NOT NULL,
    name text NOT NULL, description text NOT NULL, "createdAt" text NOT NULL, UNIQUE ("ownerId", slug)
  )`.pipe(databaseError("migrate project"));
  yield* sql`ALTER TABLE project ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)`.pipe(
    databaseError("migrate project revision"),
  );
  yield* sql`CREATE TABLE IF NOT EXISTS project_design (
    "projectId" text PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0), settings jsonb NOT NULL, tokens jsonb NOT NULL,
    guidance text NOT NULL CHECK (length(guidance) <= 64000), "sourceRevision" text NOT NULL, "updatedAt" text NOT NULL
  )`.pipe(databaseError("migrate project design"));
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
  yield* sql
    .withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO organization (id, name, slug, "createdAt")
      SELECT 'default_' || id, name || '''s team', 'team-' || id, CURRENT_TIMESTAMP FROM "user"
      ON CONFLICT (id) DO NOTHING`;
        yield* sql`INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
      SELECT 'default_member_' || id, 'default_' || id, id, 'owner', CURRENT_TIMESTAMP FROM "user"
      ON CONFLICT (id) DO NOTHING`;
        yield* sql`ALTER TABLE cli_authorization ADD COLUMN IF NOT EXISTS "organizationId" text REFERENCES organization(id)`;
        yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS member_organization_user ON member ("organizationId", "userId")`;
        yield* sql`ALTER TABLE project ADD COLUMN IF NOT EXISTS "organizationId" text REFERENCES organization(id)`;
        yield* sql`UPDATE project SET "organizationId" = 'default_' || "ownerId" WHERE "organizationId" IS NULL`;
        yield* sql`ALTER TABLE project ALTER COLUMN "organizationId" SET NOT NULL`;
        yield* sql`ALTER TABLE project DROP CONSTRAINT IF EXISTS "project_ownerId_slug_key"`;
        yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS project_organization_slug ON project ("organizationId", slug)`;
        yield* sql`ALTER TABLE project ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'))`;
        yield* sql`ALTER TABLE document ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'))`;
        yield* sql`ALTER TABLE document ADD COLUMN IF NOT EXISTS "sharingRevision" integer NOT NULL DEFAULT 1 CHECK ("sharingRevision" > 0)`;
        // Keep revisions correct for every visibility writer, including older app instances.
        yield* sql`CREATE OR REPLACE FUNCTION chronicon_document_sharing_revision() RETURNS trigger AS $$
          BEGIN
            NEW."sharingRevision" := OLD."sharingRevision" + CASE WHEN NEW.visibility IS DISTINCT FROM OLD.visibility THEN 1 ELSE 0 END;
            RETURN NEW;
          END;
        $$ LANGUAGE plpgsql`;
        yield* sql`DROP TRIGGER IF EXISTS document_sharing_revision ON document`;
        yield* sql`CREATE TRIGGER document_sharing_revision BEFORE UPDATE OF visibility, "sharingRevision" ON document
          FOR EACH ROW EXECUTE FUNCTION chronicon_document_sharing_revision()`;
        yield* sql`CREATE TABLE IF NOT EXISTS project_access (
      "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('full_access', 'edit', 'view')),
      PRIMARY KEY ("projectId", "userId")
    )`;
        yield* sql`CREATE TABLE IF NOT EXISTS document_access (
      "documentId" text NOT NULL REFERENCES document(id) ON DELETE CASCADE,
      "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('full_access', 'edit', 'view')),
      PRIMARY KEY ("documentId", "userId")
    )`;
        yield* sql`CREATE INDEX IF NOT EXISTS project_access_user ON project_access ("userId")`;
        yield* sql`CREATE INDEX IF NOT EXISTS document_access_user ON document_access ("userId")`;
        yield* sql`CREATE TABLE IF NOT EXISTS document_star (
      "documentId" text NOT NULL REFERENCES document(id) ON DELETE CASCADE,
      "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      PRIMARY KEY ("documentId", "userId")
    )`;
        yield* sql`INSERT INTO document_star ("documentId", "userId") SELECT d.id, p."ownerId" FROM document d JOIN project p ON p.id = d."projectId" WHERE d.starred = true ON CONFLICT DO NOTHING`;
        yield* sql`UPDATE document SET starred = false WHERE starred = true`;
        yield* sql`CREATE INDEX IF NOT EXISTS document_star_user ON document_star ("userId")`;
        yield* sql`CREATE TABLE IF NOT EXISTS sharing_invitation (
      id text PRIMARY KEY, type text NOT NULL CHECK (type IN ('project', 'document')),
      "projectId" text REFERENCES project(id) ON DELETE CASCADE,
      "documentId" text REFERENCES document(id) ON DELETE CASCADE,
      email text NOT NULL, role text NOT NULL CHECK (role IN ('full_access', 'edit', 'view')),
      "inviterId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('pending', 'accepted', 'cancelled')),
      "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((type = 'project' AND "projectId" IS NOT NULL AND "documentId" IS NULL)
        OR (type = 'document' AND "documentId" IS NOT NULL AND "projectId" IS NULL))
    )`;
        yield* sql`CREATE INDEX IF NOT EXISTS sharing_invitation_email ON sharing_invitation (email, status)`;
        yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS sharing_invitation_project_pending
      ON sharing_invitation ("projectId", email) WHERE status = 'pending' AND type = 'project'`;
        yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS sharing_invitation_document_pending
      ON sharing_invitation ("documentId", email) WHERE status = 'pending' AND type = 'document'`;
        yield* teamMembershipMigration;
        yield* publicLinksMigration;
      }),
    )
    .pipe(databaseError("migrate teams and sharing"));
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
