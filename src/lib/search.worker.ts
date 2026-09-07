import { Effect, Ref, Schema } from "effect";
import { buildSearch } from "./search";
import { searchRequest } from "./search-protocol";
const index = Ref.makeUnsafe<ReturnType<typeof buildSearch> | undefined>(undefined);
const handle = Effect.fnUntraced(function* (input: unknown) {
  const message = yield* Schema.decodeUnknownEffect(searchRequest)(input);
  if (message.type === "index") {
    yield* Ref.set(index, buildSearch(message.library));
    return { type: "ready" as const };
  }
  const current = yield* Ref.get(index);
  return {
    type: "results" as const,
    id: message.id,
    ids:
      current
        ?.search(message.query, {
          filter: (result) => !message.projectId || result.projectId === message.projectId,
        })
        .map((result) => String(result.id)) ?? [],
  };
});
self.onmessage = (event: MessageEvent<unknown>) => {
  self.postMessage(
    Effect.runSync(
      handle(event.data).pipe(
        Effect.catchCause(() =>
          Effect.succeed({
            type: "error" as const,
            message: "Unable to prepare search. Reload the page.",
          }),
        ),
      ),
    ),
  );
};
