import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export const usernamesMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS public_username (
    username text PRIMARY KEY CHECK (length(username) BETWEEN 3 AND 40 AND username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    "userId" text REFERENCES "user"(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    UNIQUE ("userId", username)
  )`;
  yield* sql`ALTER TABLE public_username ALTER COLUMN "userId" DROP NOT NULL`;
  yield* sql`ALTER TABLE public_username ALTER CONSTRAINT "public_username_userId_fkey" DEFERRABLE INITIALLY DEFERRED`;
  yield* sql`INSERT INTO public_username ${sql.insert(
    [
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
    ].map((username) => ({ username, userId: null })),
  )} ON CONFLICT DO NOTHING`;
  yield* sql`DROP TRIGGER IF EXISTS user_public_profile ON "user"`;
  yield* sql`DROP FUNCTION IF EXISTS chronicon_user_public_profile()`;
  yield* sql`DROP FUNCTION IF EXISTS chronicon_create_public_profile(text)`;

  // Move chosen usernames into Better Auth. Keep every issued alias, including defaults.
  yield* sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public_profile') AND relkind = 'r') THEN
      UPDATE "user" u SET username = p.username, "usernameRevision" = p.revision
        FROM public_profile p WHERE p."userId" = u.id AND p.revision > 1 AND u.username IS NULL;
      DROP TABLE public_profile;
    END IF;
  END $$`;
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_user_username() RETURNS trigger AS $$
    DECLARE base text; candidate text; claimed boolean := false;
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW."usernameRevision" IS DISTINCT FROM OLD."usernameRevision" THEN
        RAISE EXCEPTION 'Username revision changed' USING ERRCODE = '40001', CONSTRAINT = 'chronicon_username_revision';
      END IF;
      IF NEW.username IS NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL THEN
          RAISE EXCEPTION 'A username is required' USING ERRCODE = '23514';
        END IF;
        base := trim(both '-' from left(regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'), 31));
        IF length(base) < 3 THEN base := CASE WHEN base = '' THEN 'user' ELSE base || '-user' END; END IF;
        candidate := base;
        FOR attempt IN 1..32 LOOP
          INSERT INTO public_username (username, "userId") VALUES (candidate, NEW.id) ON CONFLICT DO NOTHING;
          IF FOUND OR EXISTS (SELECT 1 FROM public_username WHERE username = candidate AND "userId" = NEW.id) THEN
            claimed := true;
            EXIT;
          END IF;
          candidate := base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
        END LOOP;
        IF NOT claimed THEN RAISE EXCEPTION 'Unable to allocate a username'; END IF;
        NEW.username := candidate;
      ELSE
        NEW.username := lower(NEW.username);
        IF length(NEW.username) NOT BETWEEN 3 AND 40 OR NEW.username !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
          RAISE EXCEPTION 'Invalid username' USING ERRCODE = '23514';
        END IF;
        INSERT INTO public_username (username, "userId") VALUES (NEW.username, NEW.id) ON CONFLICT DO NOTHING;
        IF NOT EXISTS (SELECT 1 FROM public_username WHERE username = NEW.username AND "userId" = NEW.id) THEN
          RAISE EXCEPTION 'Username is taken or reserved' USING ERRCODE = '23505', CONSTRAINT = 'chronicon_username_unavailable';
        END IF;
      END IF;
      IF TG_OP = 'INSERT' OR OLD.username IS NULL THEN
        NEW."usernameRevision" := 1;
      ELSE
        NEW."usernameRevision" := OLD."usernameRevision" + CASE WHEN NEW.username IS DISTINCT FROM OLD.username THEN 1 ELSE 0 END;
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`;
  yield* sql`CREATE OR REPLACE TRIGGER user_username BEFORE INSERT OR UPDATE OF username, "usernameRevision" ON "user"
    FOR EACH ROW EXECUTE FUNCTION chronicon_user_username()`;
  yield* sql`UPDATE "user" SET username = NULL WHERE username IS NULL`;
  yield* sql`ALTER TABLE "user" ALTER COLUMN username SET NOT NULL`;
  yield* sql`ALTER TABLE "user" ALTER COLUMN "usernameRevision" SET DEFAULT 1`;
  yield* sql`ALTER TABLE "user" ALTER COLUMN "usernameRevision" SET NOT NULL`;
  yield* sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"user"'::regclass AND conname = 'user_username_alias') THEN
      ALTER TABLE "user" ADD CONSTRAINT user_username_alias FOREIGN KEY (id, username)
        REFERENCES public_username ("userId", username) DEFERRABLE INITIALLY DEFERRED;
    END IF;
  END $$`;

  // Earlier deployments can keep using their profile API during and after rollout.
  yield* sql`CREATE OR REPLACE VIEW public_profile AS
    SELECT id AS "userId", username, "usernameRevision" AS revision FROM "user"`;
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_update_legacy_profile() RETURNS trigger AS $$
    BEGIN
      UPDATE "user" SET username = NEW.username, "usernameRevision" = OLD.revision WHERE id = OLD."userId"
        RETURNING username, "usernameRevision" INTO NEW.username, NEW.revision;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`;
  yield* sql`CREATE OR REPLACE TRIGGER public_profile_update INSTEAD OF UPDATE ON public_profile
    FOR EACH ROW EXECUTE FUNCTION chronicon_update_legacy_profile()`;
});
