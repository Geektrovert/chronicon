import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect } from "effect";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { loadLibrary } from "./actions/library";
import { runtime } from "./runtime";
import type { Principal } from "@/lib/model";
import { AppError } from "./errors";

// Only stable authorization identifiers enter the Next cache key, never tokens or names.
// oxlint-disable-next-line effecttsgo/async-function -- Next requires an async function for "use cache".
async function cachedLibrary(ownerId: string, projectIds: ReadonlyArray<string> | null) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 600 });
  cacheTag(`library:${ownerId}`);
  return runtime.runPromise(loadLibrary({ ownerId, projectIds }));
}
// Call after authenticate on every request, including cache hits.
export const readCachedLibrary = Effect.fn("Cache.readLibrary")((principal: Principal) =>
  Effect.tryPromise({
    try: () =>
      cachedLibrary(
        principal.ownerId,
        principal.projectIds ? [...principal.projectIds].sort() : null,
      ),
    catch: () => new AppError({ status: 500, message: "Unable to load the library. Try again." }),
  }),
);
export class LibraryInvalidation extends Context.Service<
  LibraryInvalidation,
  { readonly invalidate: (ownerId: string) => void }
>()("chronicon/server/LibraryInvalidation") {}

// Capture Next's mutation request before entering Effect. Resuming a fiber after
// database IO must not register invalidation against a render or another request.
export function requestLibraryInvalidation() {
  return LibraryInvalidation.of({
    invalidate: AsyncLocalStorage.bind((ownerId: string) =>
      revalidateTag(`library:${ownerId}`, { expire: 0 }),
    ),
  });
}

export const invalidateLibrary = (ownerId: string) =>
  Effect.flatMap(LibraryInvalidation, (cache) => Effect.sync(() => cache.invalidate(ownerId)));
