"use client";
import { useEffect, useRef, useState } from "react";
import { useTask } from "@/client/runtime";
import { watchSearchWorker } from "@/client/actions/search";
import { capture } from "@/client/telemetry";
import type { Library } from "./model";

export function useSearch(library: Library, query: string, projectId?: string) {
  const run = useTask();
  const [worker, setWorker] = useState<Worker | null>(null);
  const latest = useRef(0);
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<ReadonlyArray<string>>([]);
  const [completedSearch, setCompletedSearch] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lastSearch = useRef("");
  function retry() {
    capture("search_retry");
    lastSearch.current = "";
    setError("");
    setReady(false);
    setIds([]);
    setAttempt((value) => value + 1);
  }
  useEffect(
    () =>
      run(
        watchSearchWorker({
          worker: setWorker,
          ready: () => setReady(true),
          results: (id, ids) => {
            if (id === latest.current) {
              setIds(ids);
              setCompletedSearch(id);
            }
          },
        }),
        {
          onError: (message) => {
            setError(message);
            capture("search_failed");
          },
        },
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
  useEffect(() => {
    if (!query.trim()) {
      lastSearch.current = "";
      return;
    }
    if (!ready || error || completedSearch !== latest.current) return;
    const search = `${projectId ?? ""}:${query}`;
    if (lastSearch.current === search) return;
    const timer = window.setTimeout(() => {
      lastSearch.current = search;
      capture("search_completed", {
        query_length: query.length,
        result_count: ids.length,
        project_scoped: projectId !== undefined,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [query, projectId, ids, ready, error, completedSearch]);
  return { ready, ids, error, retry };
}
