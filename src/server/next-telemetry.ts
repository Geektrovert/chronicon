import { SpanKind, trace, type Attributes, type SpanContext } from "@opentelemetry/api";
import { ExportResultCode, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes, type Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type TimedEvent,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Clock, Config, Deferred, Effect, Logger, Schema } from "effect";
import { posthogProxyPrefix } from "@/lib/posthog";
import {
  collectorEndpoint,
  collectorHeaders,
  serviceAttributes,
  telemetryConfiguration,
  telemetryError,
  telemetryRoute,
  type TelemetryError,
} from "./observability";

// SAFETY: This process-wide registry is an optional property used only to reuse the warm flush callback.
const shared = globalThis as typeof globalThis & {
  chroniconNextFlush?: (traceId: string | undefined) => Promise<void>;
};

const spanOperations = new Map([
  ["BaseServer.handleRequest", "next.request"],
  ["AppRouteRouteHandlers.runHandler", "next.route"],
  ["AppRender.getBodyResult", "next.render"],
  ["AppRender.renderToReadableStream", "next.render_stream"],
  ["AppRender.renderToString", "next.render_string"],
  ["AppRender.fetch", "next.fetch"],
  ["NextNodeServer.findPageComponents", "next.resolve_components"],
  ["NextNodeServer.getLayoutOrPageModule", "next.resolve_module"],
  ["NextNodeServer.startResponse", "next.response_start"],
  ["NextNodeServer.clientComponentLoading", "next.load_client_component"],
  ["ResolveMetadata.generateMetadata", "next.metadata"],
  ["ResolveMetadata.generateViewport", "next.viewport"],
  ["Render.getServerSideProps", "next.server_props"],
  ["Render.getStaticProps", "next.static_props"],
  ["Render.renderDocument", "next.document_render"],
  ["Middleware.execute", "next.proxy"],
  ["Node.runHandler", "next.handler"],
]);

const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const networkCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

type ExportFailure = {
  export_reason: string;
  export_status?: number;
  export_code?: string;
  export_span_count?: number;
};

function exportFailure(error: TelemetryError, fallback = "flush_failed", depth = 0): ExportFailure {
  if (depth > 4) return { export_reason: fallback };

  if (Array.isArray(error)) {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Array.isArray narrows the validated JSON array through the generic JS predicate.
    const first: unknown = error[0];
    const nested = Schema.is(Schema.Json)(first) ? first : undefined;

    return exportFailure(nested, fallback, depth + 1);
  }

  if (error instanceof TypeError) return { export_reason: "invalid_export_data" };

  if (error instanceof Error) {
    const cause = error.cause;

    if (cause instanceof Error || Schema.is(Schema.Json)(cause))
      return exportFailure(cause, fallback, depth + 1);

    return { export_reason: fallback };
  }

  if (!Schema.is(Schema.JsonObject)(error)) return { export_reason: fallback };

  if (error.cause) {
    const cause = Schema.is(Schema.Json)(error.cause) ? error.cause : undefined;

    if (cause) return exportFailure(cause, fallback, depth + 1);
  }

  const code = error.code;

  if (Schema.is(Schema.Finite)(code) && Number.isInteger(code) && code >= 100 && code <= 599)
    return { export_reason: "http_rejected", export_status: code };

  if (Schema.is(Schema.String)(code) && networkCodes.has(code))
    return { export_reason: "network_error", export_code: code };
  const message = Schema.is(Schema.String)(error.message) ? error.message : "";

  if (/timeout|timed out/i.test(message)) return { export_reason: "timeout" };

  if (/concurrent export limit/i.test(message)) return { export_reason: "concurrency_limit" };

  return { export_reason: fallback };
}

let lastWarning = "";

let lastWarningAt = 0;

function warnExportFailure(attributes: ExportFailure) {
  const key = `${attributes.export_reason}:${attributes.export_status ?? attributes.export_code ?? ""}`;
  const now = Effect.runSync(Clock.currentTimeMillis);

  if (key === lastWarning && now - lastWarningAt < 30_000) return;
  lastWarning = key;
  lastWarningAt = now;
  // Export diagnostics never enter their own OTLP sink or contain collector response text.
  Effect.runSync(
    Effect.logWarning("telemetry.trace_flush_failed").pipe(
      Effect.annotateLogs({ ...serviceAttributes(), ...attributes }),
      Effect.provide(Logger.layer([Logger.consoleJson])),
    ),
  );
}

function pathFrom(value: Schema.Schema.Type<typeof Schema.Unknown>) {
  if (!Schema.is(Schema.String)(value)) return undefined;

  if (value.startsWith("/")) return value.split(/[?#]/, 1)[0];

  try {
    return new URL(value).pathname;
  } catch {
    return undefined;
  }
}

function isTelemetrySpan(span: ReadableSpan, endpoint: string) {
  for (const key of ["http.route", "next.route", "http.target", "http.url", "url.full"]) {
    const value = span.attributes[key];
    const path = pathFrom(value);

    if (path === posthogProxyPrefix || path?.startsWith(`${posthogProxyPrefix}/`)) return true;

    if (!Schema.is(Schema.String)(value) || !value.startsWith("http")) continue;

    try {
      const url = new URL(value);

      if (url.hostname.endsWith(".posthog.com") || url.href.split("?", 1)[0] === endpoint)
        return true;
    } catch {
      // Malformed URLs are discarded with the rest of the raw attributes.
    }
  }

  return false;
}

function safeContext(context: SpanContext): SpanContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    traceFlags: context.traceFlags,
    isRemote: context.isRemote,
  };
}

function safeException(event: TimedEvent): TimedEvent | undefined {
  if (event.name !== "exception") return undefined;
  const attributes: Attributes = { "exception.type": "UnexpectedError" };
  const stack = event.attributes?.["exception.stacktrace"];

  if (Schema.is(Schema.String)(stack)) {
    const frames = telemetryError({ stack })
      .stack?.split("\n")
      .slice(1)
      .flatMap((line) => {
        const location = line.match(
          /app:\/\/\/\/?((?:src|\.next|node_modules)\/[A-Za-z0-9_./@~-]+:\d+:\d+)/,
        )?.[1];

        return location ? [`    at app:///${location}`] : [];
      });

    if (frames?.length)
      attributes["exception.stacktrace"] = `UnexpectedError\n${frames.join("\n")}`;
  }

  return { name: "exception", time: event.time, attributes };
}

// Rebuild the export record from safe fields. Next can put URLs and user text in
// names, status messages, events, resources, and links as well as attributes.
function safeSpan(span: ReadableSpan, resource: Resource): ReadableSpan {
  const type = span.attributes["next.span_type"];
  const operation = Schema.is(Schema.String)(type) ? spanOperations.get(type) : undefined;
  const attributes: Attributes = { app: "chronicon", event_source: "server" };

  if (operation) attributes["next.span_type"] = type;
  const method = span.attributes["http.request.method"] ?? span.attributes["http.method"];

  if (Schema.is(Schema.String)(method) && methods.has(method))
    attributes["http.request.method"] = method;

  const path =
    pathFrom(span.attributes["http.route"]) ??
    pathFrom(span.attributes["next.route"]) ??
    pathFrom(span.attributes["http.target"]);

  const route = path ? telemetryRoute(path) : undefined;

  if (route) attributes["http.route"] = route;

  const status =
    span.attributes["http.response.status_code"] ?? span.attributes["http.status_code"];

  if (
    Schema.is(Schema.Finite)(status) &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
  )
    attributes["http.response.status_code"] = status;

  if (Schema.is(Schema.Boolean)(span.attributes["next.rsc"]))
    attributes["next.rsc"] = span.attributes["next.rsc"];
  const name = operation ?? (span.kind === SpanKind.CLIENT ? "next.client" : "next.operation");

  const events = span.events.flatMap((event) => {
    const safe = safeException(event);

    return safe ? [safe] : [];
  });

  return {
    name: route ? `${name} ${route}` : name,
    kind: span.kind,
    spanContext: () => safeContext(span.spanContext()),
    parentSpanContext: span.parentSpanContext ? safeContext(span.parentSpanContext) : undefined,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    status: { code: span.status.code },
    attributes,
    links: [],
    events,
    resource,
    instrumentationScope: { name: "chronicon.next" },
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount + span.events.length - events.length,
    droppedLinksCount: span.droppedLinksCount + span.links.length,
  };
}

export function registerNextTelemetry() {
  const config = telemetryConfiguration();

  if (shared.chroniconNextFlush || !config.enabled) return;

  const settings = Effect.runSync(
    Config.all({
      disabled: Config.boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false)),
      traces: Config.boolean("POSTHOG_TRACES_ENABLED").pipe(Config.withDefault(true)),
      endpoint: Config.string("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").pipe(Config.withDefault("")),
    }).pipe(Effect.orElseSucceed(() => ({ disabled: true, traces: false, endpoint: "" }))),
  );

  if (settings.disabled || !settings.traces) return;
  const customEndpoint = collectorEndpoint(settings.endpoint);
  const endpoint = customEndpoint ?? `${config.host}/i/v1/traces`;
  const tags = serviceAttributes();

  const resource = resourceFromAttributes({
    ...tags,
    "service.version": tags.release,
    "deployment.environment": tags.environment,
  });

  const transport = new OTLPTraceExporter({
    url: endpoint,
    headers: customEndpoint
      ? collectorHeaders("TRACES")
      : { Authorization: `Bearer ${config.key}` },
    timeoutMillis: 2500,
    concurrencyLimit: 2,
  });

  const exporter: SpanExporter = {
    export(spans, done) {
      const records = spans.flatMap((span) =>
        isTelemetrySpan(span, endpoint) ? [] : [safeSpan(span, resource)],
      );

      if (!records.length) {
        done({ code: ExportResultCode.SUCCESS });

        return;
      }

      try {
        transport.export(records, (result) => {
          if (result.code !== ExportResultCode.SUCCESS)
            warnExportFailure({
              ...exportFailure(
                result.error instanceof Error || Schema.is(Schema.Json)(result.error)
                  ? result.error
                  : undefined,
                "export_failed",
              ),
              export_span_count: records.length,
            });
          done(result);
        });
      } catch (error) {
        warnExportFailure({
          ...exportFailure(
            error instanceof Error || Schema.is(Schema.Json)(error) ? error : undefined,
            "serialization_failed",
          ),
          export_span_count: records.length,
        });
        done({ code: ExportResultCode.FAILED, error: new Error("Trace export failed") });
      }
    },
    shutdown: () => transport.shutdown(),
    forceFlush: () => transport.forceFlush(),
  };

  const batch = new BatchSpanProcessor(exporter, {
    maxQueueSize: 512,
    // forceFlush sends every batch concurrently. One bounded batch leaves the
    // second transport slot available for an earlier scheduled export.
    maxExportBatchSize: 512,
    scheduledDelayMillis: 1000,
    exportTimeoutMillis: 3000,
  });

  const pendingRequests = new Map<string, { traceId: string; ended: Deferred.Deferred<void> }>();
  let endedGeneration = 0;

  const provider = new NodeTracerProvider({
    resource,
    spanLimits: {
      attributeCountLimit: 64,
      attributeValueLengthLimit: 2048,
      eventCountLimit: 8,
      linkCountLimit: 0,
    },
    spanProcessors: [
      {
        onStart(span) {
          if (
            span.attributes["next.span_type"] !== "BaseServer.handleRequest" ||
            pendingRequests.size >= 512
          )
            return;
          const context = span.spanContext();
          pendingRequests.set(context.spanId, {
            traceId: context.traceId,
            ended: Deferred.makeUnsafe<void>(),
          });
        },
        onEnd(span) {
          batch.onEnd(span);
          endedGeneration += 1;
          const id = span.spanContext().spanId;
          const pending = pendingRequests.get(id);

          if (pending) Deferred.doneUnsafe(pending.ended, Effect.void);
          pendingRequests.delete(id);
        },
        forceFlush: () => batch.forceFlush(),
        shutdown: () => batch.shutdown(),
      },
    ],
  });

  provider.register({ propagator: new W3CTraceContextPropagator() });
  let drain: Promise<void> | undefined;
  let requestedGeneration = 0;

  const drainExports = () => {
    requestedGeneration = endedGeneration;

    if (drain) return drain;
    drain = Effect.runPromise(
      Effect.gen(function* () {
        // Parallel page-data operations each register after(). Share their drain
        // and repeat only when another caller has queued newly ended spans.
        let flushedGeneration: number;

        do {
          flushedGeneration = requestedGeneration;
          yield* Effect.tryPromise(() => provider.forceFlush({ timeoutMillis: 3000 })).pipe(
            // A timed-out caller must not release the drain while earlier exports
            // still run. The caller's deadline is separate from this shared work.
            Effect.ensuring(Effect.promise(() => transport.forceFlush())),
          );
        } while (flushedGeneration !== requestedGeneration);
      }),
    ).finally(() => {
      drain = undefined;
    });

    return drain;
  };

  shared.chroniconNextFlush = (traceId) =>
    Effect.runPromise(
      Effect.gen(function* () {
        // after() can begin when the response closes, just before Next ends its root span.
        const pending = [...pendingRequests.values()].filter(
          (request) => request.traceId === traceId,
        );

        if (pending.length)
          yield* Effect.forEach(pending, (request) => Deferred.await(request.ended)).pipe(
            Effect.timeoutOption("500 millis"),
          );
        yield* Effect.tryPromise(drainExports).pipe(Effect.timeout("4 seconds"));
      }),
    );
}

export function flushNextTelemetry() {
  return Effect.runPromise(
    Effect.suspend(() => {
      const flush = shared.chroniconNextFlush;

      if (!flush) return Effect.void;
      const traceId = trace.getActiveSpan()?.spanContext().traceId;

      return Effect.tryPromise(() => flush(traceId)).pipe(
        Effect.catch((error) =>
          Effect.sync(() =>
            warnExportFailure(
              exportFailure(
                error instanceof Error || Schema.is(Schema.Json)(error) ? error : undefined,
              ),
            ),
          ),
        ),
      );
    }),
  );
}
