import { AsyncLocalStorage } from "node:async_hooks";
import {
  Cause,
  Config,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  Option,
  Schema,
  Tracer,
} from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  OtlpExporter,
  OtlpLogger,
  OtlpSerialization,
  OtlpTracer,
} from "effect/unstable/observability";
import { PostHog } from "posthog-node";
import type { Principal } from "@/lib/model";
import { posthogHosts } from "@/lib/posthog";
import {
  AppError,
  AuthenticationError,
  ConfigurationError,
  DatabaseError,
  StorageError,
} from "./errors";

type Attribute = string | number | boolean;
export type Attributes = Record<string, Attribute>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const telemetryUuid = (value: string | null | undefined) =>
  value && uuidPattern.test(value) ? value : undefined;
const identifier = (value: string) => (/^[a-z0-9:_-]{1,128}$/i.test(value) ? value : undefined);

const staticRoutes = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/projects",
  "/starred",
  "/archive",
  "/settings",
  "/settings/appearance",
  "/settings/team",
  "/settings/account",
  "/cli/authorize",
  "/api/account",
  "/api/account/profile",
  "/api/documents",
  "/api/projects",
  "/api/library",
  "/api/keys",
  "/api/sharing",
  "/api/teams",
  "/api/mcp",
  "/api/cli/authorize",
  "/api/cli/token",
]);
const authRoutes = new Set([
  "sign-in/email",
  "sign-up/email",
  "sign-out",
  "get-session",
  "verify-email",
  "send-verification-email",
  "update-user",
  "change-password",
  "revoke-session",
  "revoke-sessions",
  "revoke-other-sessions",
  "organization/invite-member",
  "organization/accept-invitation",
  "organization/reject-invitation",
  "organization/cancel-invitation",
  "organization/list-invitations",
  "organization/list-members",
  "organization/remove-member",
  "organization/update-member-role",
  "organization/set-active",
  "organization/get-full-organization",
  "organization/list",
  "organization/leave",
]);

// Only fixed route templates leave the server. Dynamic segments and query strings never do.
export function telemetryRoute(path: string) {
  const pathname = path.split("?")[0] ?? "/";
  if (staticRoutes.has(pathname)) return pathname;
  if (pathname.startsWith("/api/auth/")) {
    const operation = pathname.slice("/api/auth/".length);
    return authRoutes.has(operation) ? pathname : "/api/auth/[operation]";
  }
  const patterns = [
    [/^\/api\/documents\/[^/]+$/, "/api/documents/[id]"],
    [/^\/api\/projects\/[^/]+\/design\.md$/, "/api/projects/[id]/design.md"],
    [/^\/api\/projects\/[^/]+\/design$/, "/api/projects/[id]/design"],
    [/^\/api\/invitations\/[^/]+$/, "/api/invitations/[id]"],
    [/^\/documents\/[^/]+$/, "/documents/[id]"],
    [/^\/projects\/[^/]+\/design$/, "/projects/[slug]/design"],
    [/^\/projects\/[^/]+$/, "/projects/[slug]"],
    [/^\/invitations\/[^/]+$/, "/invitations/[id]"],
    [/^\/public\/documents\/[^/]+$/, "/public/documents/[id]"],
    [/^\/[^/]+\/d\/[^/]+\/?$/, "/[username]/d/[documentSlug]"],
    [/^\/public\/projects\/[^/]+$/, "/public/projects/[id]"],
  ] as const;
  return patterns.find(([pattern]) => pattern.test(pathname))?.[1] ?? "/[unmatched]";
}

export function telemetryConfiguration() {
  const key = readConfig("NEXT_PUBLIC_POSTHOG_KEY");
  const setting = readConfig("NEXT_PUBLIC_POSTHOG_ENABLED");
  const enabled =
    setting === "true" || (setting !== "false" && readConfig("NODE_ENV") === "production");
  const host = posthogHosts(readConfig("NEXT_PUBLIC_POSTHOG_HOST")).ingestion;
  return { key, enabled: enabled && key.startsWith("phc_"), host };
}

const readConfig = (name: string, fallback = "") =>
  Effect.runSync(Config.string(name).pipe(Config.withDefault(fallback)));

export function serviceAttributes(): Attributes {
  const environment =
    readConfig("NEXT_PUBLIC_APP_ENV") ||
    readConfig("VERCEL_ENV") ||
    readConfig("NODE_ENV", "development");
  return {
    app: "chronicon",
    service_name: "chronicon",
    "service.name": "chronicon",
    environment,
    "deployment.environment.name": environment,
    release:
      readConfig("NEXT_PUBLIC_APP_RELEASE") || readConfig("VERCEL_GIT_COMMIT_SHA", "development"),
    event_source: "server",
  };
}

export type RequestTelemetry = {
  attributes: Attributes;
  posthog?: PostHog;
  parent?: Tracer.AnySpan;
  context?: Context.Context<OtlpExporter.Flusher>;
  trackingAllowed: boolean;
  completed?: boolean;
  metrics: {
    db_query_count: number;
    db_duration_ms: number;
    storage_operation_count: number;
    storage_duration_ms: number;
  };
};
export const CurrentTelemetry = Context.Reference<RequestTelemetry | undefined>(
  "chronicon/RequestTelemetry",
  {
    defaultValue: () => undefined,
  },
);
export const telemetryContext = new AsyncLocalStorage<RequestTelemetry>();

export function annotateAuthenticatedUser(
  userId: string,
  organizationId?: string,
  access = "owner",
) {
  const state = telemetryContext.getStore();
  const id = identifier(userId);
  if (!state || !id || !state.trackingAllowed) return;
  Object.assign(state.attributes, {
    user_id: id,
    posthogDistinctId: `chronicon:user:${id}`,
    distinct_id: `chronicon:user:${id}`,
    access,
    authenticated: true,
    ...(organizationId && identifier(organizationId) ? { organization_id: organizationId } : {}),
  });
}

export const annotatePrincipal = (principal: Principal) =>
  Effect.gen(function* () {
    const state = yield* CurrentTelemetry;
    if (!state || !state.trackingAllowed) return;
    const id = identifier(principal.ownerId);
    if (!id) return;
    Object.assign(state.attributes, {
      user_id: id,
      posthogDistinctId: `chronicon:user:${id}`,
      distinct_id: `chronicon:user:${id}`,
      access: principal.access,
      authenticated: true,
      organization_id: principal.organizationId,
    });
  });

export const annotateTelemetry = (attributes: Attributes) =>
  Effect.gen(function* () {
    const state = yield* CurrentTelemetry;
    if (state) Object.assign(state.attributes, attributes);
  });

export function safeFailure(cause: Cause.Cause<unknown>) {
  const found = Cause.findErrorOption(cause);
  const error = Option.isSome(found) ? found.value : undefined;
  if (Schema.is(AppError)(error))
    return { status: error.status, error_type: "AppError", expected: error.status < 500 };
  if (Cause.hasInterruptsOnly(cause))
    return { status: 499, error_type: "Interrupted", expected: true };
  if (Schema.is(DatabaseError)(error))
    return { status: 500, error_type: "DatabaseError", expected: false };
  if (Schema.is(StorageError)(error))
    return { status: 500, error_type: "StorageError", expected: false };
  if (Schema.is(AuthenticationError)(error))
    return { status: 500, error_type: "AuthenticationError", expected: false };
  if (Schema.is(ConfigurationError)(error))
    return { status: 500, error_type: "ConfigurationError", expected: false };
  return { status: 500, error_type: "UnexpectedError", expected: false };
}

// Retain source locations for symbolication, excluding messages, causes and source context.
export function telemetryError(error: unknown, type = "UnexpectedError") {
  const safe = new Error(type);
  safe.name = type;
  safe.stack = `${type}: ${type}`;
  const stack: unknown =
    error && typeof error === "object" ? Reflect.get(error, "stack") : undefined;
  if (typeof stack === "string") {
    const frames = stack
      .split("\n")
      .slice(1)
      .flatMap((line) => {
        const frame = line.match(/^\s+at (?:[A-Za-z0-9_.$<> ]+ \()?(.+):(\d+):(\d+)\)?$/);
        if (!frame) return [];
        const location = frame[1]!.replace(/^file:\/\//, "").split("?")[0]!;
        if (!location.startsWith(`${process.cwd()}/`)) return [];
        const relative = location.slice(process.cwd().length + 1);
        if (!/^(?:src|\.next|node_modules)\/[A-Za-z0-9_./@~%[\]-]+$/.test(relative)) return [];
        return [`    at app:///${relative}:${frame[2]}:${frame[3]}`];
      })
      .slice(0, 40);
    if (frames.length) safe.stack = `${type}: ${type}\n${frames.join("\n")}`;
  }
  return safe;
}

export function makeRequestTelemetry(
  headers: Headers,
  method: string,
  path: string,
): RequestTelemetry {
  const config = telemetryConfiguration();
  const trackingAllowed =
    headers.get("x-chronicon-telemetry") !== "off" && headers.get("dnt") !== "1";
  // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- The synchronous HTTP boundary needs an unguessable ID before the Effect runtime exists.
  const requestId = telemetryUuid(headers.get("x-chronicon-request-id")) ?? crypto.randomUUID();
  const anonymousId = trackingAllowed
    ? telemetryUuid(headers.get("x-chronicon-distinct-id"))
    : undefined;
  const sessionId = trackingAllowed
    ? telemetryUuid(headers.get("x-chronicon-session-id"))
    : undefined;
  const trace = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(
    headers.get("traceparent") ?? "",
  );
  const parent =
    trace && !/^0+$/.test(trace[1]!) && !/^0+$/.test(trace[2]!)
      ? Tracer.externalSpan({
          traceId: trace[1]!,
          spanId: trace[2]!,
          sampled: (Number.parseInt(trace[3]!, 16) & 1) === 1,
        })
      : undefined;
  return {
    trackingAllowed,
    metrics: {
      db_query_count: 0,
      db_duration_ms: 0,
      storage_operation_count: 0,
      storage_duration_ms: 0,
    },
    attributes: {
      ...serviceAttributes(),
      request_id: requestId,
      method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(method)
        ? method
        : "OTHER",
      route: telemetryRoute(path),
      authenticated: false,
      distinct_id: anonymousId ?? `chronicon:request:${requestId}`,
      posthogDistinctId: anonymousId ?? `chronicon:request:${requestId}`,
      ...(sessionId ? { sessionId, $session_id: sessionId } : {}),
    },
    parent,
    posthog:
      config.enabled && trackingAllowed
        ? new PostHog(config.key, {
            host: config.host,
            flushAt: 100,
            maxQueueSize: 500,
            flushInterval: 0,
            requestTimeout: 2500,
            fetchRetryCount: 1,
            fetchRetryDelay: 200,
            enableExceptionAutocapture: false,
            disableGeoip: true,
          })
        : undefined,
  };
}

export function captureServerEvent(
  state: RequestTelemetry,
  event: string,
  attributes: Attributes = {},
) {
  try {
    state.posthog?.capture({
      distinctId: String(state.attributes.distinct_id),
      event,
      properties: {
        ...state.attributes,
        ...attributes,
        $process_person_profile: state.attributes.authenticated,
      },
    });
  } catch {
    // Analytics cannot change the result of a committed action.
  }
}

const reportedErrors = new WeakSet<object>();
export function captureServerException(
  state: RequestTelemetry,
  error: unknown,
  type: string,
  attributes: Attributes = {},
) {
  if (!state.posthog || (error instanceof Object && reportedErrors.has(error))) return;
  try {
    state.posthog.captureException(
      telemetryError(error, type),
      String(state.attributes.distinct_id),
      {
        ...state.attributes,
        ...attributes,
        $process_person_profile: state.attributes.authenticated,
      },
    );
    if (error instanceof Object) reportedErrors.add(error);
  } catch {
    // Preserve the original failure even if the reporting SDK fails.
  }
}

export const recordOperation = (event: string, attributes: Attributes = {}) =>
  Effect.gen(function* () {
    const state = yield* CurrentTelemetry;
    if (!state) return;
    Object.assign(state.attributes, attributes);
    captureServerEvent(state, event, { outcome: "success" });
  });

export const logWideEvent = (state: RequestTelemetry, event: string, attributes: Attributes) => {
  const fields: Attributes = { ...state.attributes, ...attributes, event };
  const status = Number(fields.status ?? 200);
  const log =
    status >= 500
      ? Effect.logError(event)
      : status >= 400
        ? Effect.logWarning(event)
        : Effect.logInfo(event);
  return log.pipe(Effect.annotateLogs(fields));
};

const spanAttributeKeys = new Set([
  "app",
  "service.name",
  "environment",
  "release",
  "request_id",
  "method",
  "route",
  "status",
  "outcome",
  "user_id",
  "organization_id",
  "project_id",
  "document_id",
  "access",
  "authenticated",
  "sessionId",
  "posthogDistinctId",
  "http.request.method",
  "http.route",
  "http.response.status_code",
  "error.type",
  "db.system",
  "db.system.name",
  "db.operation.name",
  "storage.provider",
  "storage.operation",
  "mcp.tool",
  "mcp_tool",
  "duration_ms",
  "revision",
  "created",
  "unchanged",
  "result_count",
]);

const safeMessages = new Set([
  "chronicon_request_completed",
  "chronicon_auth_completed",
  "chronicon_mcp_tool_completed",
  "chronicon_page_data_completed",
  "chronicon_server_error",
  "Email delivery failed",
  "Authentication failed internally",
  "An idle database connection closed.",
  "Database pool close failed.",
  "Could not remove an uncommitted upload.",
  "telemetry.trace_flush_failed",
]);
function safeLogEntry(entry: Logger.Options<unknown>) {
  const messages: unknown[] = Array.isArray(entry.message) ? entry.message : [entry.message];
  const first = messages[0];
  const message =
    typeof first === "string" && safeMessages.has(first) ? first : "chronicon_diagnostic";
  return { ...entry, message, cause: Cause.empty };
}
export const diagnosticLogger = Logger.make((entry) => {
  try {
    Logger.consoleJson.log(safeLogEntry(entry));
  } catch {
    /* Stdout failure cannot replace an application result. */
  }
});

export function logOperationalError(event: string, attributes: Attributes = {}) {
  const state = telemetryContext.getStore();
  if (state)
    Object.assign(state.attributes, attributes, {
      diagnostic_count: Number(state.attributes.diagnostic_count ?? 0) + 1,
    });
  const log = Effect.logError(event).pipe(
    Effect.annotateLogs({ ...serviceAttributes(), ...state?.attributes, ...attributes }),
  );
  const correlatedLog = state?.parent ? log.pipe(Effect.withParentSpan(state.parent)) : log;
  try {
    Effect.runSync(
      state?.context
        ? correlatedLog.pipe(Effect.provide(state.context))
        : correlatedLog.pipe(Effect.provide(Logger.layer([diagnosticLogger]))),
    );
  } catch {
    /* Framework callback diagnostics are best effort. */
  }
}

function safeTracer(underlying: Tracer.Tracer, state: RequestTelemetry) {
  let count = 0;
  return Tracer.make({
    span(options) {
      const name =
        /^(?:[A-Z][A-Za-z0-9]*\.[A-Za-z0-9_.]+|(?:http|sql|page|mcp)\.[a-z_]+|http\.client (?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD))$/.test(
          options.name,
        )
          ? options.name
          : "effect.operation";
      const span =
        count++ < 1000
          ? underlying.span({ ...options, name, links: [] })
          : new Tracer.NativeSpan({ ...options, name, links: [], sampled: false });
      if (count > 1000) state.attributes.dropped_span_count = count - 1000;
      for (const [key, value] of Object.entries(state.attributes))
        if (spanAttributeKeys.has(key)) span.attribute(key, value);
      const end = span.end.bind(span);
      const attribute = span.attribute.bind(span);
      span.attribute = (key, value) => {
        if (spanAttributeKeys.has(key) && ["string", "number", "boolean"].includes(typeof value))
          attribute(key, value);
      };
      span.event = () => undefined;
      span.addLinks = () => undefined;
      span.end = (endTime, exit) => {
        const elapsed = Number(endTime - options.startTime) / 1_000_000;
        if (options.name === "sql.execute") {
          state.metrics.db_query_count += 1;
          state.metrics.db_duration_ms += elapsed;
        }
        if (["Storage.put", "Storage.read", "Storage.remove"].includes(options.name)) {
          state.metrics.storage_operation_count += 1;
          state.metrics.storage_duration_ms += elapsed;
        }
        if (Exit.isFailure(exit)) {
          const failure = safeFailure(exit.cause);
          attribute("error.type", failure.error_type);
          end(
            endTime,
            failure.expected ? Exit.void : Exit.fail(telemetryError(undefined, failure.error_type)),
          );
        } else end(endTime, Exit.void);
      };
      return span;
    },
  });
}

export function collectorEndpoint(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function collectorHeaders(signal: "LOGS" | "TRACES") {
  const input =
    readConfig(`OTEL_EXPORTER_OTLP_${signal}_HEADERS`) || readConfig("OTEL_EXPORTER_OTLP_HEADERS");
  try {
    return Object.fromEntries(
      input
        .split(",")
        .filter(Boolean)
        .map((pair) => {
          const separator = pair.indexOf("=");
          return [
            decodeURIComponent(pair.slice(0, separator).trim()),
            decodeURIComponent(pair.slice(separator + 1).trim()),
          ];
        }),
    );
  } catch {
    return {};
  }
}

export function requestObservabilityLayer(state: RequestTelemetry, exportTelemetry = true) {
  const config = telemetryConfiguration();
  const resource = {
    serviceName: "chronicon",
    serviceVersion: String(state.attributes.release),
    attributes: serviceAttributes(),
  };
  const options = {
    resource,
    exportInterval: "1 second" as const,
    maxBatchSize: 100,
    shutdownTimeout: "3 seconds" as const,
  };
  const exporters = exportTelemetry && config.enabled && readConfig("OTEL_SDK_DISABLED") !== "true";
  const logsEnabled = readConfig("POSTHOG_LOGS_ENABLED") !== "false";
  const tracesEnabled = readConfig("POSTHOG_TRACES_ENABLED") !== "false";
  const logCollector = collectorEndpoint(readConfig("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"));
  const traceCollector = collectorEndpoint(readConfig("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"));
  const logs = Effect.gen(function* () {
    const sinks: Array<Logger.Logger<unknown, unknown>> = [diagnosticLogger];
    if (exporters && logsEnabled)
      sinks.push(
        yield* OtlpLogger.make({
          ...options,
          url: `${config.host}/i/v1/logs`,
          headers: { Authorization: `Bearer ${config.key}` },
        }).pipe(Effect.provide(Logger.layer([diagnosticLogger]))),
      );
    if (exporters && logCollector)
      sinks.push(
        yield* OtlpLogger.make({
          ...options,
          url: logCollector,
          headers: collectorHeaders("LOGS"),
        }).pipe(Effect.provide(Logger.layer([diagnosticLogger]))),
      );
    let count = 0;
    return Logger.make((entry) => {
      if (count++ >= 1000) {
        state.attributes.dropped_log_count = count - 1000;
        return;
      }
      // Causes in either the cause field or message arguments can include SQL and credentials.
      const safeEntry = safeLogEntry(entry);
      for (const sink of sinks) {
        try {
          sink.log(safeEntry);
        } catch {
          /* A sink must not fail the application fiber. */
        }
      }
    });
  });
  const tracer = Effect.gen(function* () {
    const underlying =
      exporters && tracesEnabled
        ? yield* OtlpTracer.make({
            ...options,
            url: traceCollector ?? `${config.host}/i/v1/traces`,
            headers: traceCollector
              ? collectorHeaders("TRACES")
              : { Authorization: `Bearer ${config.key}` },
          }).pipe(Effect.provide(Logger.layer([diagnosticLogger])))
        : Tracer.make({ span: (options) => new Tracer.NativeSpan(options) });
    return safeTracer(underlying, state);
  });
  return Layer.mergeAll(Logger.layer([logs]), Layer.effect(Tracer.Tracer, tracer)).pipe(
    Layer.provideMerge(OtlpExporter.layerFlusher),
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(FetchHttpClient.layer),
  );
}
