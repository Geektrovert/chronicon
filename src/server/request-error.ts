import type { Instrumentation } from "next";
import { Cause, Effect, Exit, Layer, Scope, Tracer } from "effect";
import { trace } from "@opentelemetry/api";
import {
  captureServerException,
  logWideEvent,
  makeRequestTelemetry,
  requestObservabilityLayer,
  safeFailure,
} from "./observability";
import { flushNextTelemetry } from "./next-telemetry";

// This path must work when the application runtime itself failed to initialize.
// oxlint-disable-next-line effecttsgo/async-function -- Framework error hook explicitly awaits bounded telemetry delivery.
export const reportRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const requestHeaders = new Headers();
  for (const key of [
    "x-chronicon-request-id",
    "x-chronicon-session-id",
    "x-chronicon-distinct-id",
    "x-chronicon-telemetry",
    "dnt",
    "traceparent",
  ]) {
    const value = request.headers[key];
    if (typeof value === "string") requestHeaders.set(key, value);
  }
  const state = makeRequestTelemetry(requestHeaders, request.method, request.path);
  const failure = safeFailure(Cause.fail(error));
  const span = trace.getActiveSpan()?.spanContext();
  if (span)
    state.parent = Tracer.externalSpan({
      traceId: span.traceId,
      spanId: span.spanId,
      sampled: (span.traceFlags & 1) === 1,
    });
  if (state.parent)
    Object.assign(state.attributes, {
      trace_id: state.parent.traceId,
      span_id: state.parent.spanId,
    });
  const attributes = {
    error_type: failure.error_type,
    status: failure.status,
    outcome: "error",
    route_type: context.routeType,
  };
  captureServerException(state, error, failure.error_type, attributes);
  const scope = Scope.makeUnsafe("parallel");
  try {
    const services = await Effect.runPromise(
      Layer.buildWithScope(requestObservabilityLayer(state), scope),
    );
    const log = logWideEvent(state, "chronicon_server_error", attributes);
    await Effect.runPromise(
      (state.parent ? log.pipe(Effect.withParentSpan(state.parent)) : log).pipe(
        Effect.provide(services),
      ),
    );
  } catch {
    // Reporting cannot replace the original framework error.
  } finally {
    await Promise.allSettled([
      Effect.runPromise(
        Scope.close(scope, Exit.void).pipe(Effect.interruptible, Effect.timeoutOption("4 seconds")),
      ),
      state.posthog?.shutdown(3500),
      flushNextTelemetry(),
    ]);
  }
};
