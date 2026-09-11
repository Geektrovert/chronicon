import type { Pool } from "pg";

export const defaultTeamId = (userId: string) => `default_${userId}`;

// Run after Better Auth commits a new user. One statement creates both records,
// and stable IDs make repeated bootstrap calls safe across concurrent requests.
export function ensureDefaultTeam(pool: Pool, user: { id: string; name: string }) {
  const organizationId = defaultTeamId(user.id);

  return pool
    .query(
      `WITH team AS (
      INSERT INTO organization (id, name, slug, "createdAt")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING id
    )
    INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
    SELECT $4, team.id, $5, 'owner', NOW() FROM team
    ON CONFLICT (id) DO NOTHING`,
      [
        organizationId,
        user.name.trim() ? `${user.name.trim()}'s team` : "My team",
        `team-${user.id}`,
        `default_member_${user.id}`,
        user.id,
      ],
    )
    .then(() => organizationId);
}
