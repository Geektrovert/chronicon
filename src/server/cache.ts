import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect } from "effect";
import { revalidateTag } from "next/cache";
import { loadLibrary } from "./actions/library";
import type { Principal } from "@/lib/model";

// Re-read grants on every request. Cached authorized snapshots can outlive revocation.
export const readCachedLibrary = Effect.fn("Cache.readLibrary")((principal: Principal) =>
  loadLibrary(principal),
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
