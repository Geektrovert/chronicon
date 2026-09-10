import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export const teamMembershipMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Better Auth's invitation hook runs before its separate acceptance write.
  // Keep the inviter eligible until that write commits, including when a role
  // change or removal races with accepting the invitation.
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_authorize_team_invitation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      inviter_membership_id text;
    BEGIN
      SELECT m.id INTO inviter_membership_id FROM member m
        JOIN "user" u ON u.id = m."userId"
        WHERE m."userId" = NEW."inviterId" AND m."organizationId" = NEW."organizationId"
          AND m.role IN ('owner', 'admin')
          AND u."emailVerified" = true AND COALESCE(u.banned, false) = false
        FOR SHARE OF m, u;

      IF inviter_membership_id IS NULL OR OLD.status <> 'pending'
        OR NEW."expiresAt" <= clock_timestamp() OR NEW.role NOT IN ('member', 'admin') THEN
        RAISE EXCEPTION 'This team invitation is no longer available.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$`;
  yield* sql`CREATE OR REPLACE TRIGGER chronicon_team_invitation_accepted
    BEFORE UPDATE OF status ON invitation FOR EACH ROW
    WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    EXECUTE FUNCTION chronicon_authorize_team_invitation()`;
  yield* sql`CREATE OR REPLACE FUNCTION chronicon_revoke_team_membership()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      successor_id text;
      departing_email text;
    BEGIN
      PERFORM id FROM project WHERE "organizationId" = OLD."organizationId"
        ORDER BY id FOR UPDATE;

      SELECT "userId" INTO successor_id FROM member
        WHERE "organizationId" = OLD."organizationId"
          AND 'default_' || "userId" = OLD."organizationId" AND role = 'owner'
        LIMIT 1;
      SELECT lower(email) INTO departing_email FROM "user" WHERE id = OLD."userId";

      IF successor_id IS NOT NULL THEN
        UPDATE project SET "ownerId" = successor_id, revision = revision + 1
          WHERE "organizationId" = OLD."organizationId" AND "ownerId" = OLD."userId";
      END IF;

      DELETE FROM project_access access USING project
        WHERE access."projectId" = project.id AND access."userId" = OLD."userId"
          AND project."organizationId" = OLD."organizationId";
      DELETE FROM document_access access USING document, project
        WHERE access."documentId" = document.id AND document."projectId" = project.id
          AND access."userId" = OLD."userId" AND project."organizationId" = OLD."organizationId";

      UPDATE invitation SET status = 'canceled'
        WHERE "organizationId" = OLD."organizationId" AND status = 'pending'
          AND ("inviterId" = OLD."userId" OR lower(email) = departing_email);

      UPDATE sharing_invitation invitation SET status = 'cancelled'
        WHERE invitation.status = 'pending'
          AND (invitation."inviterId" = OLD."userId" OR lower(invitation.email) = departing_email)
          AND EXISTS (
            SELECT 1 FROM project WHERE project."organizationId" = OLD."organizationId"
              AND (project.id = invitation."projectId" OR EXISTS (
                SELECT 1 FROM document
                  WHERE document.id = invitation."documentId" AND document."projectId" = project.id
              ))
          );
      RETURN OLD;
    END;
    $$`;
  yield* sql`CREATE OR REPLACE TRIGGER chronicon_member_removed
    AFTER DELETE ON member FOR EACH ROW EXECUTE FUNCTION chronicon_revoke_team_membership()`;
});
