import { Effect } from "effect";
import { publicProfileInput } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readPublicProfile, updatePublicProfile } from "@/server/actions/profile";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      return yield* readPublicProfile(yield* authenticate(request.headers));
    }),
  );

export const PATCH = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      return yield* updatePublicProfile(
        principal,
        request.headers,
        yield* decodeInput(publicProfileInput, yield* readJSON(request)),
      );
    }).pipe(Effect.uninterruptible),
  );
