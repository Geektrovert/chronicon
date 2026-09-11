import { Effect } from "effect";
import { teamInput } from "@/lib/sharing";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readTeams, changeTeam } from "@/server/actions/teams";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      return yield* readTeams(yield* authenticate(request.headers));
    }),
  );

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);

      return yield* changeTeam(
        principal,
        request.headers,
        yield* decodeInput(teamInput, yield* readJSON(request)),
      );
    }).pipe(Effect.uninterruptible),
  );
