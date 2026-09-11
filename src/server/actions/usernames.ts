import type { Pool } from "pg";
import { APIError } from "better-auth/api";

export function canUseUsername(pool: Pool, username: string, userId?: string) {
  return pool
    .query<{ userId: string | null }>(`SELECT "userId" FROM public_username WHERE username = $1`, [
      username.toLowerCase(),
    ])
    .then(({ rows }) => !rows.length || rows[0]?.userId === userId);
}

export function usernamePrecondition(headers?: Headers) {
  const value = headers?.get("if-match");
  if (!value) return undefined;
  const match = /^"username-([1-9][0-9]*)"$/.exec(value);
  const revision = Number(match?.[1]);
  if (!Number.isSafeInteger(revision) || revision > 2_147_483_647)
    throw new APIError("BAD_REQUEST", { message: "Send a valid username revision in If-Match." });
  return revision;
}
