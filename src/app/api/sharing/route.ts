import { Effect } from "effect";
import { sharingInput, sharingReference } from "@/lib/sharing";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readSharing, changeSharing } from "@/server/actions/sharing";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const query = new URL(request.url).searchParams;

      return yield* readSharing(
        principal,
        yield* decodeInput(sharingReference, { type: query.get("type"), id: query.get("id") }),
      );
    }),
  );

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);

      return yield* changeSharing(
        principal,
        yield* decodeInput(sharingInput, yield* readJSON(request)),
      );
    }),
  );
