import { Effect, Schema, Stream } from "effect";
import { searchResponse } from "@/lib/search-protocol";
import { ClientError } from "../errors";

export const watchSearchWorker = Effect.fn("Client.watchSearchWorker")(function* (receive: {
  worker: (worker: Worker) => void;
  ready: () => void;
  results: (id: number, ids: ReadonlyArray<string>) => void;
}) {
  const worker = yield* Effect.acquireRelease(
    Effect.try({
      try: () => new Worker(new URL("../../lib/search.worker.ts", import.meta.url)),
      catch: () => new ClientError({ message: "Search is unavailable. Reload the page." }),
    }),
    (worker) => Effect.sync(() => worker.terminate()),
  );
  receive.worker(worker);
  const messages = Stream.fromEventListener<MessageEvent<unknown>>(worker, "message").pipe(
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        const message = yield* Schema.decodeUnknownEffect(searchResponse)(event.data).pipe(
          Effect.mapError(
            () => new ClientError({ message: "Search returned invalid data. Reload the page." }),
          ),
        );
        if (message.type === "ready") receive.ready();
        else if (message.type === "error")
          return yield* new ClientError({ message: message.message });
        else receive.results(message.id, message.ids);
      }),
    ),
  );
  const errors = Stream.fromEventListener(worker, "error").pipe(
    Stream.runForEach(() =>
      Effect.fail(new ClientError({ message: "Search stopped. Reload the page." })),
    ),
  );
  yield* Effect.all([messages, errors], { concurrency: "unbounded" });
}, Effect.scoped);
