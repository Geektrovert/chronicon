import { Effect, Exit, Layer, Scope } from "effect";
import { flushNextTelemetry } from "../next-telemetry";
import { requestObservabilityLayer, type RequestTelemetry } from "../observability";

export function createTelemetrySession(state: RequestTelemetry) {
  const scope = Scope.makeUnsafe("parallel");
  return {
    build: (exporters = true) =>
      Effect.runPromise(Layer.buildWithScope(requestObservabilityLayer(state, exporters), scope)),
    // Scope.close awaits exports already in flight, which Flusher.flush alone cannot do.
    drain: () =>
      Promise.allSettled([
        Effect.runPromise(
          Scope.close(scope, Exit.void).pipe(
            Effect.interruptible,
            Effect.timeoutOption("4 seconds"),
          ),
        ),
        state.posthog?.shutdown(3500),
        flushNextTelemetry(),
      ]).then(([exporters, posthog, next]) => ({ exporters, posthog, next })),
  };
}
