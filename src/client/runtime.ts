"use client";

import { Cause, Effect, Exit, ManagedRuntime, Option, Result, Schema } from "effect";
import { useCallback, useEffect, useRef } from "react";
import { Api } from "./services/api";
import { ClientError } from "./errors";
import { captureError } from "./telemetry";

const runtime = ManagedRuntime.make(Api.layer);

function taskError(cause: Cause.Cause<unknown>) {
  const error = Cause.findErrorOption(cause);

  if (Option.isSome(error) && Schema.is(ClientError)(error.value)) return error.value.message;
  const defect = Cause.findDefect(cause);

  if (Result.isSuccess(defect)) captureError(defect.success, { source: "effect_runtime" });

  return "Unable to confirm the result. Refresh to check for changes before trying again.";
}

// React Actions await the write, keeping useOptimistic active until confirmation.
// Unlike view subscriptions, writes must finish when Activity hides their page.
export function runAction<A, E>(program: Effect.Effect<A, E, Api>) {
  return runtime
    .runPromiseExit(program)
    .then((exit) =>
      Exit.isSuccess(exit) ? Result.succeed(exit.value) : Result.fail(taskError(exit.cause)),
    );
}

type TaskCallbacks<A> = {
  onSuccess?: (value: A) => void;
  onError?: (message: string) => void;
  onSettled?: () => void;
};

// React owns task lifetime. Leaving a component interrupts its requests and finalizes resources.
export function useTask() {
  const pending = useRef(new Set<AbortController>());
  useEffect(() => {
    const tasks = pending.current;

    return () => {
      for (const task of tasks) task.abort();
      tasks.clear();
    };
  }, []);

  return useCallback(
    <A, E>(program: Effect.Effect<A, E, Api>, callbacks: TaskCallbacks<A> = {}) => {
      const controller = new AbortController();
      pending.current.add(controller);
      void runtime.runPromiseExit(program, { signal: controller.signal }).then((exit) => {
        pending.current.delete(controller);

        if (controller.signal.aborted) return;

        if (Exit.isSuccess(exit)) callbacks.onSuccess?.(exit.value);
        else callbacks.onError?.(taskError(exit.cause));
        callbacks.onSettled?.();
      });

      return () => controller.abort();
    },
    [],
  );
}
