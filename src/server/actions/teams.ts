import { PgClient } from "@effect/sql-pg";
import { Effect, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import type { Principal } from "@/lib/model";
import { teamsSchema, teamInput } from "@/lib/sharing";
import { Auth, authCall } from "../auth";
import { databaseError } from "../database";
import { AppError } from "../errors";
import { ownerAccess } from "./access";
import { annotateTelemetry, recordOperation } from "../observability";

export const readTeams = Effect.fn("Teams.read")(function* (principal: Principal) {
  yield* ownerAccess(principal);
  const sql = yield* PgClient.PgClient;

  const teams = yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: teamsSchema.fields.teams.value,
    execute: (id) =>
      sql`SELECT o.id, o.name, m.role FROM organization o JOIN member m ON m."organizationId" = o.id WHERE m."userId" = ${id} ORDER BY o."createdAt", o.id`,
  })(principal.ownerId).pipe(databaseError("list teams"));

  const active = teams.find((team) => team.id === principal.organizationId);

  if (!active)
    return yield* new AppError({
      status: 403,
      message: "Team membership changed. Reload the workspace.",
    });
  const canManage = ["owner", "admin"].includes(active.role) && !!principal.emailVerified;

  const members = yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: teamsSchema.fields.members.value,
    execute: (id) =>
      sql`SELECT m.id, m."userId", u.name, u.email, m.role FROM member m JOIN "user" u ON u.id = m."userId" WHERE m."organizationId" = ${id} ORDER BY m."createdAt"`,
  })(active.id).pipe(databaseError("list team members"));

  const invitations = canManage
    ? yield* SqlSchema.findAll({
        Request: Schema.String,
        Result: teamsSchema.fields.invitations.value,
        execute: (id) =>
          sql`SELECT id, email, role, status FROM invitation WHERE "organizationId" = ${id} AND status = 'pending' AND "expiresAt" > CURRENT_TIMESTAMP ORDER BY "createdAt"`,
      })(active.id).pipe(databaseError("list team invitations"))
    : [];

  return {
    teams,
    activeTeamId: active.id,
    userId: principal.ownerId,
    emailVerified: !!principal.emailVerified,
    canManage,
    members,
    invitations,
  };
});

export const changeTeam = Effect.fn("Teams.change")(function* (
  principal: Principal,
  headers: Headers,
  input: typeof teamInput.Type,
) {
  yield* ownerAccess(principal);
  const auth = yield* Auth;
  const current = yield* readTeams(principal);

  if (input.action === "switch") {
    if (!current.teams.some((team) => team.id === input.organizationId))
      return yield* new AppError({ status: 403, message: "You are not a member of that team." });
    yield* authCall(() =>
      auth.api.setActiveOrganization({ headers, body: { organizationId: input.organizationId } }),
    );
    yield* annotateTelemetry({ organization_id: input.organizationId });
    yield* recordOperation("chronicon_team_switched");

    return yield* readTeams({ ...principal, organizationId: input.organizationId });
  }

  if (!current.canManage)
    return yield* new AppError({
      status: 403,
      message: principal.emailVerified
        ? "Only team owners and admins can manage members."
        : "Verify your email before inviting or managing members.",
    });

  if (input.action === "invite") {
    yield* authCall(() =>
      auth.api.createInvitation({
        headers,
        body: {
          organizationId: current.activeTeamId,
          email: input.email.toLowerCase(),
          role: input.role,
          resend: true,
        },
      }),
    );
  } else if (input.action === "remove") {
    const member = current.members.find((member) => member.id === input.memberId);

    if (!member || member.role === "owner")
      return yield* new AppError({ status: 400, message: "The team owner cannot be removed." });
    yield* authCall(() =>
      auth.api.removeMember({
        headers,
        body: { organizationId: current.activeTeamId, memberIdOrEmail: member.id },
      }),
    );
  } else {
    if (!current.invitations.some((invite) => invite.id === input.invitationId))
      return yield* new AppError({ status: 404, message: "Invitation not found." });
    yield* authCall(() =>
      auth.api.cancelInvitation({ headers, body: { invitationId: input.invitationId } }),
    );
  }

  yield* recordOperation("chronicon_team_changed", { action: input.action });

  return yield* readTeams(principal);
});
