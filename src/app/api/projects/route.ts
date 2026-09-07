import { Effect } from "effect";
import { projectInput } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { createProject } from "@/server/actions/projects";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";
export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const input = yield* decodeInput(projectInput, yield* readJSON(request));
      return yield* createProject(principal, input);
    }),
  );
