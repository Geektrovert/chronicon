import { Cache, Context, Crypto, Effect, Layer } from "effect";
import { buildSearch } from "@/lib/search";
import type { Library } from "@/lib/model";
import { hashJson } from "./hash";

class SearchSnapshot extends Context.Service<SearchSnapshot, Library>()(
  "chronicon/server/SearchSnapshot",
) {}

const makeSearch = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const indexes = yield* Cache.make({
    capacity: 8,
    timeToLive: "10 minutes",
    requireServicesAt: "lookup",
    lookup: (_fingerprint: string) =>
      SearchSnapshot.use((library) => Effect.sync(() => buildSearch(library))),
  });
  const search = Effect.fn("Search.search")(function* (
    library: Library,
    query: string,
    projectId?: string,
  ) {
    // Hash the authorized snapshot, so cached indexes cannot mix owners or project scopes.
    const fingerprint = yield* hashJson(library).pipe(
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.orDie,
    );
    const index = yield* Cache.get(indexes, fingerprint).pipe(
      Effect.provideService(SearchSnapshot, library),
    );
    return index.search(query, {
      filter: (result) => !projectId || result.projectId === projectId,
    });
  });
  return { search };
});

export class SearchService extends Context.Service<
  SearchService,
  Effect.Success<typeof makeSearch>
>()("chronicon/server/Search") {
  static readonly layer = Layer.effect(SearchService, makeSearch);
}
