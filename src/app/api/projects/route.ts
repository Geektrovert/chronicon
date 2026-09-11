import { Effect } from "effect";
import { projectInput, projectUpdate, repositoryAssociation } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { createProject, updateProject } from "@/server/actions/projects";
import { AppConfig } from "@/server/config";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const input = yield* decodeInput(projectInput, yield* readJSON(request));
      const project = yield* createProject(principal, input);
      const config = yield* AppConfig;

      return {
        ...project,
        association: repositoryAssociation(config.origin, principal.ownerId, project),
      };
    }),
  );

export const PATCH = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);

      return yield* updateProject(
        principal,
        yield* decodeInput(projectUpdate, yield* readJSON(request)),
      );
    }),
  );
