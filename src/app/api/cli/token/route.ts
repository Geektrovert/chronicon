import { Effect } from "effect";
import { cliExchange } from "@/lib/cli-auth";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { exchangeCli, revokeCli } from "@/server/actions/cli-auth";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      return yield* exchangeCli(yield* decodeInput(cliExchange, yield* readJSON(request)));
    }),
  );
export const DELETE = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      return yield* revokeCli(yield* authenticate(request.headers));
    }),
  );
