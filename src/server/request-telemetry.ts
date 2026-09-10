import { Cause, Effect, Exit, Layer, References, Scope, Tracer } from "effect";
import { trace } from "@opentelemetry/api";
import { after } from "next/server";
import { headers } from "next/headers";
import { runtime, type AppServices } from "./runtime";
import type { Principal } from "@/lib/model";
import { flushNextTelemetry } from "./next-telemetry";
import {
  CurrentTelemetry,
  annotatePrincipal,
  captureServerEvent,
  captureServerException,
  logWideEvent,
  makeRequestTelemetry,
  requestObservabilityLayer,
  safeFailure,
  telemetryContext,
  type RequestTelemetry,
} from "./observability";

function observed<A, E, R>(
  state: RequestTelemetry,
  program: Effect.Effect<A, E, R>,
  operation: string,
  event: string,
  started = performance.now(),
) {
  const metrics = { ...state.metrics };
  return Effect.useSpan(
    operation,
    { kind: operation === "http.request" ? "server" : "internal", parent: state.parent },
    (span) => {
      state.parent = span;
      state.attributes.trace_id = span.traceId;
      state.attributes.span_id = span.spanId;
      return program.pipe(
        Effect.onExit((exit) => {
          state.completed = true;
          const failure = Exit.isFailure(exit) ? safeFailure(exit.cause) : undefined;
          const status =
            failure?.status ??
            (Exit.isSuccess(exit) && exit.value instanceof Response ? exit.value.status : 200);
          const attributes = {
            operation,
            status,
            outcome:
              status >= 500
                ? "error"
                : status === 499
                  ? "cancelled"
                  : status >= 400
                    ? "rejected"
                    : "success",
            duration_ms: Math.round((performance.now() - started) * 100) / 100,
            db_query_count: state.metrics.db_query_count - metrics.db_query_count,
            db_duration_ms:
              Math.round((state.metrics.db_duration_ms - metrics.db_duration_ms) * 100) / 100,
            storage_operation_count:
              state.metrics.storage_operation_count - metrics.storage_operation_count,
            storage_duration_ms:
              Math.round((state.metrics.storage_duration_ms - metrics.storage_duration_ms) * 100) /
              100,
            ...(failure
              ? { error_type: failure.error_type, expected_error: failure.expected }
              : {}),
          };
          for (const [key, value] of Object.entries(state.attributes)) span.attribute(key, value);
          span.attribute("http.response.status_code", status);
          span.attribute("outcome", attributes.outcome);
          if (status >= 500) {
            const type = failure?.error_type ?? "ServerResponseError";
            captureServerException(
              state,
              Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined,
              type,
              attributes,
            );
          }
          if (state.attributes.route !== "/api/library" || status >= 400)
            captureServerEvent(state, event, attributes);
          return logWideEvent(state, event, attributes);
        }),
        Effect.withParentSpan(span),
      );
    },
  ).pipe(
    Effect.provideService(CurrentTelemetry, state),
    Effect.provideService(References.CurrentLogAnnotations, state.attributes),
  );
}

// Exporters belong to the request; the Postgres/Auth service graph stays shared.
// Scope.close awaits exports already in flight, which Flusher.flush alone cannot do.
// oxlint-disable-next-line effecttsgo/async-function -- Next after owns the serverless lifetime beyond the response.
export async function runObservedRequest<A, E>(
  requestHeaders: Headers,
  method: string,
  path: string,
  program: Effect.Effect<A, E, AppServices>,
  options: { signal?: AbortSignal; operation?: string; event?: string } = {},
) {
  const started = performance.now();
  const state = makeRequestTelemetry(requestHeaders, method, path);
  const parent = trace.getActiveSpan()?.spanContext();
  if (parent)
    state.parent = Tracer.externalSpan({
      traceId: parent.traceId,
      spanId: parent.spanId,
      sampled: (parent.traceFlags & 1) === 1,
    });
  const scope = Scope.makeUnsafe("parallel");
  after(() =>
    Promise.allSettled([
      Effect.runPromise(
        Scope.close(scope, Exit.void).pipe(Effect.interruptible, Effect.timeoutOption("4 seconds")),
      ),
      state.posthog?.shutdown(3500),
      flushNextTelemetry(),
    ]).then(() => undefined),
  );
  const context = await Effect.runPromise(
    Layer.buildWithScope(requestObservabilityLayer(state), scope),
  ).catch(() =>
    Effect.runPromise(Layer.buildWithScope(requestObservabilityLayer(state, false), scope)),
  );
  state.context = context;
  const exit = await telemetryContext.run(state, () =>
    runtime.runPromiseExit(
      observed(
        state,
        program,
        options.operation ?? "http.request",
        options.event ?? "chronicon_request_completed",
        started,
      ).pipe(Effect.provide(context)),
      { signal: options.signal },
    ),
  );
  // ManagedRuntime can fail during service acquisition before the observed program starts.
  if (!state.completed && Exit.isFailure(exit)) {
    await Effect.runPromiseExit(
      observed(
        state,
        Effect.failCause(exit.cause),
        options.operation ?? "http.request",
        options.event ?? "chronicon_request_completed",
        started,
      ).pipe(Effect.provide(context)),
    );
  }
  return { exit, state };
}

export function runObservedTool<A, E>(
  name: string,
  program: Effect.Effect<A, E, AppServices>,
  signal: AbortSignal,
) {
  const request = telemetryContext.getStore();
  if (!request?.context) return runtime.runPromiseExit(program, { signal });
  const state: RequestTelemetry = {
    ...request,
    completed: false,
    attributes: { ...request.attributes, mcp_tool: name },
  };
  return runtime.runPromiseExit(
    observed(state, program, `mcp.${name}`, "chronicon_mcp_tool_completed").pipe(
      Effect.provide(request.context),
    ),
    { signal },
  );
}

export function telemetryResponseHeaders(
  response: Response,
  state: RequestTelemetry,
  extraHeaders?: HeadersInit,
) {
  const responseHeaders = new Headers(response.headers);
  if (extraHeaders)
    for (const [key, value] of new Headers(extraHeaders)) responseHeaders.set(key, value);
  responseHeaders.set("x-chronicon-request-id", String(state.attributes.request_id));
  if (state.attributes.trace_id)
    responseHeaders.set("x-chronicon-trace-id", String(state.attributes.trace_id));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

// oxlint-disable-next-line effecttsgo/async-function -- Read request headers during the server render, before scheduling after.
export async function runObservedPage<A, E>(
  operation: string,
  path: string,
  program: Effect.Effect<A, E, AppServices>,
  principal?: Principal,
) {
  const requestHeaders = await headers();
  const { exit } = await runObservedRequest(
    requestHeaders,
    "GET",
    path,
    principal ? Effect.andThen(annotatePrincipal(principal), program) : program,
    {
      operation,
      event: "chronicon_page_data_completed",
    },
  );
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  return exit.value;
}
