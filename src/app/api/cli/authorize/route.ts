import { Effect } from "effect";
import { cliAuthorization } from "@/lib/cli-auth";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { approveCli } from "@/server/actions/cli-auth";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);

      return yield* approveCli(
        principal,
        yield* decodeInput(cliAuthorization, yield* readJSON(request)),
      );
    }),
  );
