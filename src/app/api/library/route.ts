import { Effect } from "effect";
import { authenticate } from "@/server/actions/access";
import { readCachedLibrary } from "@/server/cache";
import { route } from "@/server/http";
export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      return yield* readCachedLibrary(yield* authenticate(request.headers));
    }),
  );
