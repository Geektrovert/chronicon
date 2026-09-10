import { Cause, Context, Effect, Exit, Option, Result, Schema } from "effect";
import { ClientError } from "./errors";
import { capture, requestSpan, wideLog, type TelemetryProperties } from "./telemetry";

export const ActionTelemetry = Context.Reference<TelemetryProperties | undefined>(
  "chronicon/ActionTelemetry",
  {
    defaultValue: () => undefined,
  },
);

export const observeAction =
  (operation: string, properties: TelemetryProperties = {}) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const started = performance.now();
      const startedAt = performance.timeOrigin + started;
      // oxlint-disable-next-line effecttsgo/crypto-random-uuid-in-effect -- The pinned Effect 4 Random module has no UUID API; browser UUIDs correlate action records.
      const actionId = crypto.randomUUID();
      const requestProperties: TelemetryProperties = {};
      yield* Effect.sync(() =>
        capture(`${operation}_started`, { ...properties, action_id: actionId }),
      );
      const exit = yield* Effect.exit(
        program.pipe(Effect.provideService(ActionTelemetry, requestProperties)),
      );
      const failure = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none();
      const error =
        Option.isSome(failure) && Schema.is(ClientError)(failure.value) ? failure.value : undefined;
      const outcome = Exit.isSuccess(exit)
        ? "success"
        : error
          ? "failure"
          : Result.isSuccess(Cause.findDefect(exit.cause))
            ? "defect"
            : "cancelled";
      yield* Effect.sync(() => {
        const durationMs = performance.now() - started;
        const completion = {
          ...properties,
          ...requestProperties,
          action_id: actionId,
          operation,
          outcome,
          duration_ms: Math.round(durationMs),
          status: error?.status,
        };
        capture(`${operation}_${Exit.isSuccess(exit) ? "completed" : "failed"}`, completion);
        wideLog("action", completion, Exit.isSuccess(exit) ? "info" : "warn");
        if (requestProperties.trace_id && !requestProperties.request_span_recorded)
          requestSpan(completion, startedAt, durationMs);
      });
      return Exit.isSuccess(exit) ? exit.value : yield* Effect.failCause(exit.cause);
    });
