import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export const publicLinksMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS public_document_link (
    "documentId" text PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
    "ownerId" text NOT NULL REFERENCES "user"(id),
    slug text NOT NULL CHECK (length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    identifier text NOT NULL CHECK (identifier ~ '^[0-9a-f]{4}$'),
    UNIQUE ("ownerId", slug, identifier)
  )`;
  // Allocate once, including writes from app instances running during a migration.
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_create_document_link(document_id text, owner_id text, document_slug text) RETURNS void AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public_document_link WHERE "documentId" = document_id) THEN RETURN; END IF;
      FOR attempt IN 1..32 LOOP
        INSERT INTO public_document_link ("documentId", "ownerId", slug, identifier)
          VALUES (document_id, owner_id, document_slug, substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
          ON CONFLICT ("ownerId", slug, identifier) DO NOTHING;
        IF FOUND THEN RETURN; END IF;
      END LOOP;
      RAISE EXCEPTION 'Unable to allocate a public document link';
    END;
  $$ LANGUAGE plpgsql`;
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_document_public_link() RETURNS trigger AS $$
    BEGIN
      PERFORM chronicon_create_document_link(NEW.id, p."ownerId", NEW.slug)
        FROM project p WHERE p.id = NEW."projectId";
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`;
  yield* sql`DROP TRIGGER IF EXISTS document_public_link ON document`;
  yield* sql`CREATE TRIGGER document_public_link AFTER INSERT ON document
    FOR EACH ROW EXECUTE FUNCTION chronicon_document_public_link()`;
  yield* sql`SELECT chronicon_create_document_link(d.id, p."ownerId", d.slug)
    FROM document d JOIN project p ON p.id = d."projectId"
    WHERE NOT EXISTS (SELECT 1 FROM public_document_link l WHERE l."documentId" = d.id)`;
});
