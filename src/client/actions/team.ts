import { Effect } from "effect";
import { teamInput, teamsSchema } from "@/lib/sharing";
import { decodeClient } from "../errors";
import { request } from "./request";
import { announceTeamChange } from "./session";
import { observeAction } from "../observe-action";

export const loadTeams = request(teamsSchema, "/api/teams");
export const changeTeam = (input: typeof teamInput.Type) =>
  decodeClient(teamInput, input).pipe(
    Effect.flatMap((body) => request(teamsSchema, "/api/teams", { method: "POST", body })),
    observeAction(`team_${input.action}`, {
      role: input.action === "invite" ? input.role : undefined,
    }),
  );
export const switchTeam = (organizationId: string) =>
  changeTeam({ action: "switch", organizationId }).pipe(
    Effect.andThen(announceTeamChange),
    Effect.andThen(Effect.sync(() => window.location.assign("/"))),
  );
