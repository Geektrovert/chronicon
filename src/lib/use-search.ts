"use client";
import { useEffect, useRef, useState } from "react";
import { Effect, Schema, Stream } from "effect";
import { ClientError } from "@/client/errors";
import { useTask } from "@/client/runtime";
import { searchResponse } from "./search-protocol";
import type { Library } from "./model";

export function useSearch(library: Library, query: string, projectId?: string) {
  const run = useTask();
  const [worker, setWorker] = useState<Worker | null>(null);
  const latest = useRef(0);
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<ReadonlyArray<string>>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  function retry() {
    setError("");
    setReady(false);
    setIds([]);
    setAttempt((value) => value + 1);
  }
  useEffect(
    () =>
      run(
        Effect.scoped(
          Effect.gen(function* () {
            const resource = yield* Effect.acquireRelease(
              Effect.try({
                try: () => new Worker(new URL("./search.worker.ts", import.meta.url)),
                catch: () =>
                  new ClientError({ message: "Search is unavailable. Reload the page." }),
              }),
              (worker) =>
                Effect.sync(() => {
                  worker.terminate();
                }),
            );
            setWorker(resource);
            const messages = Stream.fromEventListener<MessageEvent<unknown>>(
              resource,
              "message",
            ).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const message = yield* Schema.decodeUnknownEffect(searchResponse)(
                    event.data,
                  ).pipe(
                    Effect.mapError(
                      () =>
                        new ClientError({
                          message: "Search returned invalid data. Reload the page.",
                        }),
                    ),
                  );
                  if (message.type === "ready") setReady(true);
                  else if (message.type === "error")
                    return yield* new ClientError({ message: message.message });
                  else if (message.id === latest.current) setIds(message.ids);
                }),
              ),
            );
            const errors = Stream.fromEventListener(resource, "error").pipe(
              Stream.runForEach(() =>
                Effect.fail(new ClientError({ message: "Search stopped. Reload the page." })),
              ),
            );
            yield* Effect.all([messages, errors], { concurrency: "unbounded" });
          }),
        ),
        { onError: setError },
      ),
    [run, attempt],
  );
  useEffect(() => {
    worker?.postMessage({ type: "index", library });
  }, [library, worker]);
  useEffect(() => {
    worker?.postMessage({
      type: "search",
      id: ++latest.current,
      query,
      ...(projectId === undefined ? {} : { projectId }),
    });
  }, [query, projectId, library, ready, worker]);
  return { ready, ids, error, retry };
}
