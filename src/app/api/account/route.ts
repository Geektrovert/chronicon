import { Effect } from "effect";
import { authenticate } from "@/server/actions/access";
import { AppConfig } from "@/server/config";
import { route } from "@/server/http";

export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const config = yield* AppConfig;

      return { server: config.origin, workspaceId: principal.ownerId, name: principal.name };
    }),
  );
