import { Effect } from "effect";
import { publishInput } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { publishDocument } from "@/server/actions/documents";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const input = yield* decodeInput(publishInput, yield* readJSON(request));

      return yield* publishDocument(principal, input);
    }),
  );
