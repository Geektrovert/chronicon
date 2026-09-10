import { Effect } from "effect";
import { authenticate } from "@/server/actions/access";
import { libraryQuery } from "@/lib/model";
import { loadProjectLibrary } from "@/server/actions/library";
import { decodeInput } from "@/server/errors";
import { readCachedLibrary } from "@/server/cache";
import { route } from "@/server/http";
export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const query = yield* decodeInput(
        libraryQuery,
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return yield* query.projectId
        ? loadProjectLibrary(principal, query.projectId)
        : readCachedLibrary(principal);
    }),
  );
