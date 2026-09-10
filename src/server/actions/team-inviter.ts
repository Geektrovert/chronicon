import type { Pool } from "pg";

export function isEligibleTeamInviter(
  pool: Pool,
  invitation: { inviterId: string; organizationId: string },
) {
  return pool
    .query(
      `SELECT m.id FROM member m
       JOIN "user" u ON u.id = m."userId"
       WHERE m."userId" = $1 AND m."organizationId" = $2
         AND m.role IN ('owner', 'admin')
         AND u."emailVerified" = true AND COALESCE(u.banned, false) = false`,
      [invitation.inviterId, invitation.organizationId],
    )
    .then((result) => result.rowCount === 1);
}
