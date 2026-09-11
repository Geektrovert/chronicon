"use client";

import { Effect, Schema } from "effect";
import posthog, { type CaptureResult, type CaptureLogOptions } from "posthog-js";
import { posthogProxyPrefix, posthogSdkPaths, posthogTracePath } from "@/lib/posthog";

// Next replaces these public values in the browser bundle.
/* oxlint-disable effecttsgo/process-env */
const projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const enabled =
  process.env.NEXT_PUBLIC_POSTHOG_ENABLED === "true" ||
  (process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "false" && process.env.NODE_ENV === "production");

const environment = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV;

const release = process.env.NEXT_PUBLIC_APP_RELEASE ?? "development";

const uiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com";
/* oxlint-enable effecttsgo/process-env */

let initialized = false;

let authenticated = false;

let lastPage = "";

const capturedErrors = new WeakSet<object>();

export type TelemetryProperties = Record<string, string | number | boolean | undefined>;

type TelemetryInput = {
  readonly [key: string]: Schema.Schema.Type<typeof Schema.Unknown>;
};

const propertyNames = new Set([
  "app",
  "service_name",
  "environment",
  "release",
  "event_schema_version",
  "auth_state",
  "route",
  "operation",
  "outcome",
  "duration_ms",
  "request_id",
  "trace_id",
  "span_id",
  "status",
  "method",
  "failure_kind",
  "source",
  "project_id",
  "document_id",
  "revision",
  "kind",
  "revision_publish",
  "starred",
  "archived",
  "visibility",
  "resource_type",
  "role",
  "invitation_type",
  "project_scoped",
  "scope_count",
  "write_access",
  "expiration_days",
  "result_count",
  "query_length",
  "file_bytes",
  "mode",
  "setting",
  "value",
  "action_id",
  "navigation_type",
  "boundary",
  "digest",
  "posthogDistinctId",
  "sessionId",
  "distinct_id",
  "$device_id",
  "$session_id",
  "$window_id",
  "$anon_distinct_id",
  "$identified_distinct_id",
  "$is_identified",
  "$process_person_profile",
  "$lib",
  "$lib_version",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$insert_id",
  "$pageview_id",
  "$prev_pageview_id",
  "$prev_pageview_duration",
  "$exception_level",
  "$exception_type",
  "$exception_fingerprint",
  "$exception_handled",
  "$exception_synthetic",
]);

// Only allow explicitly selected scalar attributes. Never serialize action input or server errors.
function safeProperties(input: TelemetryInput) {
  const output: TelemetryProperties = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      /^\$web_vitals_(?:LCP|CLS|FCP|INP|TTFB)_value$/.test(key) &&
      Schema.is(Schema.Finite)(value) &&
      Number.isFinite(value)
    ) {
      output[key] = value;
      continue;
    }

    if (!propertyNames.has(key)) continue;

    if (
      Schema.is(Schema.Boolean)(value) ||
      (Schema.is(Schema.Finite)(value) && Number.isFinite(value))
    )
      output[key] = value;
    else if (Schema.is(Schema.String)(value) && value.length <= 160) output[key] = value;
  }

  return output;
}

export function telemetryRoute(value: string) {
  const path = value.split(/[?#]/, 1)[0] ?? "/";

  if (
    [
      "/",
      "/projects",
      "/starred",
      "/archive",
      "/sign-in",
      "/sign-up",
      "/settings",
      "/settings/team",
      "/settings/account",
      "/settings/appearance",
      "/cli/authorize",
    ].includes(path)
  )
    return path;

  if (/^\/projects\/[^/]+\/design\/?$/.test(path)) return "/projects/[id]/design";

  if (/^\/projects\/[^/]+\/?$/.test(path)) return "/projects/[id]";

  if (/^\/documents\/[^/]+\/?$/.test(path)) return "/documents/[id]";

  if (/^\/invitations\/[^/]+\/?$/.test(path)) return "/invitations/[id]";

  if (/^\/public\/documents\/[^/]+\/?$/.test(path)) return "/public/documents/[id]";

  if (/^\/[^/]+\/d\/[^/]+\/?$/.test(path)) return "/[username]/d/[documentSlug]";

  if (/^\/public\/projects\/[^/]+\/?$/.test(path)) return "/public/projects/[id]";

  if (/^\/api\/projects\/[^/]+\/design(?:\.md)?\/?$/.test(path)) return "/api/projects/[id]/design";

  if (/^\/api\/documents\/[^/]+\/?$/.test(path)) return "/api/documents/[id]";

  if (/^\/api\/invitations\/[^/]+\/?$/.test(path)) return "/api/invitations/[id]";

  if (path.startsWith("/api/auth/")) return "/api/auth/[operation]";

  if (
    [
      "/api/library",
      "/api/projects",
      "/api/documents",
      "/api/keys",
      "/api/teams",
      "/api/sharing",
      "/api/cli/authorize",
      "/api/account",
      "/api/account/profile",
    ].includes(path)
  )
    return path;

  return "/[other]";
}

function context() {
  return {
    app: "chronicon",
    service_name: "chronicon",
    environment,
    release,
    event_schema_version: 1,
    auth_state: authenticated ? "authenticated" : "anonymous",
    route: telemetryRoute(window.location.pathname),
  } satisfies TelemetryProperties;
}

// Monitoring failures must never change a user action's result.
function bestEffort(action: () => void) {
  Effect.runSync(Effect.try(action).pipe(Effect.ignore));
}

function record(value: Schema.Schema.Type<typeof Schema.Unknown>): Schema.JsonObject {
  return Schema.is(Schema.JsonObject)(value) ? value : {};
}

function scrubExceptionList(value: Schema.Schema.Type<typeof Schema.Unknown>, handled: boolean) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 5).map((entry) => {
    // oxlint-disable-next-line typescript/no-unsafe-argument -- Array.isArray narrows the SDK payload to any[]; record validates the item as JSON.
    const exception = record(entry);
    const frames = record(exception.stacktrace).frames;

    return {
      type:
        Schema.is(Schema.String)(exception.type) &&
        /^(?:Type|Range|Reference|Syntax|URI|Eval)?Error$/.test(exception.type)
          ? exception.type
          : "Error",
      value: "Unexpected client error",
      mechanism: { type: "generic", handled },
      stacktrace: {
        type: "raw",
        frames: Array.isArray(frames)
          ? frames.slice(-40).map((item) => {
              // oxlint-disable-next-line typescript/no-unsafe-argument -- The validated exception frame array is exposed as any[] by the SDK type.
              const frame = record(item);

              const filename = Schema.is(Schema.String)(frame.filename)
                ? frame.filename.match(/\/_next\/static\/[a-zA-Z0-9_./~-]+/)?.[0]
                : undefined;

              return {
                platform: "web:javascript",
                filename: filename ? `${window.location.origin}${filename}` : "[redacted]",
                in_app: Boolean(filename),
                chunk_id:
                  Schema.is(Schema.String)(frame.chunk_id) &&
                  /^[0-9a-f-]{16,64}$/i.test(frame.chunk_id)
                    ? frame.chunk_id
                    : undefined,
                lineno: Schema.is(Schema.Finite)(frame.lineno) ? frame.lineno : undefined,
                colno: Schema.is(Schema.Finite)(frame.colno) ? frame.colno : undefined,
                function:
                  Schema.is(Schema.String)(frame.function) &&
                  /^[\w.$<> ]{1,120}$/.test(frame.function)
                    ? frame.function
                    : undefined,
              };
            })
          : [],
      },
    };
  });
}

function beforeSend(event: CaptureResult | null) {
  if (
    !event ||
    !(
      event.event.startsWith("chronicon.") ||
      ["$pageview", "$pageleave", "$identify", "$set", "$exception", "$web_vitals"].includes(
        event.event,
      )
    )
  )
    return null;

  const properties = safeProperties(event.properties);

  // oxlint-disable-next-line typescript/no-unsafe-assignment -- PostHog exposes event properties as any; the next branch validates the value as JSON.
  const exceptions: Schema.Schema.Type<typeof Schema.Unknown> = Schema.is(Schema.Json)(
    event.properties.$exception_list,
  )
    ? event.properties.$exception_list
    : undefined;

  const route = Schema.is(Schema.String)(properties.route)
    ? telemetryRoute(properties.route)
    : telemetryRoute(window.location.pathname);

  event.properties = {
    ...properties,
    ...context(),
    // PostHog drops events without this required public ingestion credential.
    // Restore our configured project key, never a token supplied by an event caller.
    token: projectKey,
    route,
    $current_url: `${window.location.origin}${route}`,
    $pathname: route,
  };
  // The SDK also enriches person properties outside event.properties.
  // Initial URLs and campaign fields must not bypass the event property allowlist.
  delete event.$set;
  delete event.$set_once;
  delete event.$unset;

  if (event.event === "$exception")
    event.properties.$exception_list = scrubExceptionList(
      exceptions,
      properties.source !== "window" && properties.source !== "unhandled_rejection",
    );

  if (event.event === "$identify") event.properties.$set = { app: "chronicon" };

  return event;
}

const logBodies = new Set([
  "chronicon.browser.action",
  "chronicon.browser.request",
  "chronicon.browser.error",
]);

function beforeSendLog(log: CaptureLogOptions): CaptureLogOptions | null {
  // This also rejects console capture enabled remotely in the shared PostHog project.
  if (!logBodies.has(log.body) || log.attributes?.event_schema_version !== 1) return null;
  const attributes = { ...context(), ...safeProperties(log.attributes) };

  if (Schema.is(Schema.String)(attributes.route))
    attributes.route = telemetryRoute(attributes.route);

  return { ...log, attributes };
}

export function initializeTelemetry() {
  if (initialized || !enabled || !projectKey) return;
  bestEffort(() => {
    posthog.init(projectKey, {
      api_host: posthogProxyPrefix,
      ui_host: uiHost,
      defaults: "2026-08-30",
      rewriteRequestPath(url) {
        const path = url.pathname.startsWith(posthogProxyPrefix)
          ? url.pathname.slice(posthogProxyPrefix.length)
          : url.pathname;

        const rewrite = posthogSdkPaths.find(([source]) => path.startsWith(source));

        if (rewrite) url.pathname = posthogProxyPrefix + rewrite[1] + path.slice(rewrite[0].length);

        return url;
      },
      persistence: "localStorage",
      persistence_name: "chronicon.posthog",
      cross_subdomain_cookie: false,
      person_profiles: "identified_only",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      capture_performance: { web_vitals: true },
      disable_session_recording: true,
      disable_surveys: true,
      enable_recording_console_log: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      save_referrer: false,
      save_campaign_params: false,
      respect_dnt: true,
      ip: false,
      before_send: beforeSend,
      logs: {
        serviceName: "chronicon",
        environment,
        serviceVersion: release,
        resourceAttributes: {
          app: "chronicon",
          "telemetry.schema.version": "1",
          "service.namespace": "chronicon",
        },
        captureConsoleLogs: false,
        beforeSend: beforeSendLog,
        maxBufferSize: 50,
        maxLogsPerInterval: 100,
      },
    });
    initialized = true;
    posthog.register(context());
  });
}

export function capture(event: string, properties: TelemetryProperties = {}) {
  if (!initialized) return;
  bestEffort(() =>
    posthog.capture(`chronicon.${event}`, { ...context(), ...safeProperties(properties) }),
  );
}

export function capturePage(pathname: string) {
  if (!initialized || lastPage === pathname) return;
  lastPage = pathname;
  bestEffort(() => posthog.capture("$pageview", { ...context(), route: telemetryRoute(pathname) }));
}

export function identifyUser(userId: string) {
  if (!initialized) return;
  bestEffort(() => {
    const distinctId = `chronicon:user:${userId}`;
    const previousId = posthog.get_distinct_id();

    if (previousId.startsWith("chronicon:user:") && previousId !== distinctId) posthog.reset(true);
    const changed = !authenticated || previousId !== distinctId;
    authenticated = true;
    posthog.identify(distinctId, { app: "chronicon" });

    if (changed) capture("session_identified");
  });
}

export function resetIdentity() {
  if (!initialized) return;
  bestEffort(() => {
    posthog.reset(true);
    authenticated = false;
    posthog.register(context());
  });
}

export function requestContext(sampled = true) {
  /* oxlint-disable effecttsgo/crypto-random-uuid -- Synchronous browser and Better Auth request boundaries need collision-resistant W3C IDs. */
  const requestId = crypto.randomUUID();
  const traceId = crypto.randomUUID().replaceAll("-", "");
  const spanId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);

  /* oxlint-enable effecttsgo/crypto-random-uuid */
  const headers = new Headers({
    "x-chronicon-request-id": requestId,
    traceparent: `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`,
    "x-chronicon-telemetry": "off",
  });

  if (initialized)
    bestEffort(() => {
      if (posthog.has_opted_out_capturing()) return;
      headers.set("x-chronicon-telemetry", "on");
      headers.set("x-chronicon-session-id", posthog.get_session_id());
      headers.set("x-chronicon-distinct-id", posthog.get_distinct_id());
    });

  return { requestId, traceId, spanId, headers };
}

// Application requests export browser CLIENT spans that parent their server spans.
export function requestSpan(
  properties: TelemetryProperties,
  startedAt: number,
  durationMs: number,
) {
  if (!initialized) return;
  bestEffort(() => {
    if (posthog.has_opted_out_capturing()) return;

    const attributes = {
      ...context(),
      ...safeProperties(properties),
      sessionId: posthog.get_session_id(),
      posthogDistinctId: posthog.get_distinct_id(),
    };

    const spanAttributes = Object.entries(attributes).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [
            {
              key,
              value: Schema.is(Schema.Boolean)(value)
                ? { boolValue: value }
                : Schema.is(Schema.Finite)(value)
                  ? { doubleValue: value }
                  : { stringValue: value },
            },
          ],
    );

    const body = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "chronicon" } },
              { key: "service.namespace", value: { stringValue: "chronicon" } },
              { key: "service.version", value: { stringValue: release } },
              { key: "deployment.environment.name", value: { stringValue: environment } },
              { key: "app", value: { stringValue: "chronicon" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "chronicon.browser", version: "1" },
              spans: [
                {
                  traceId: properties.trace_id,
                  spanId: properties.span_id,
                  name: `${properties.method} ${properties.route}`,
                  kind: 3,
                  startTimeUnixNano: (startedAt * 1_000_000).toFixed(0),
                  endTimeUnixNano: ((startedAt + durationMs) * 1_000_000).toFixed(0),
                  attributes: spanAttributes,
                  status: { code: properties.outcome === "failure" ? 2 : 1 },
                },
              ],
            },
          ],
        },
      ],
    });

    void Effect.runPromise(
      Effect.tryPromise(() =>
        // oxlint-disable-next-line effecttsgo/global-fetch-in-effect -- Native keepalive lets the browser finish the bounded OTLP export during navigation.
        fetch(posthogProxyPrefix + posthogTracePath[1], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          credentials: "omit",
        }),
      ).pipe(Effect.ignore),
    );
  });
}

export function wideLog(
  body: "action" | "request" | "error",
  properties: TelemetryProperties,
  level: "info" | "warn" | "error" = "info",
) {
  if (!initialized) return;
  bestEffort(() =>
    posthog.captureLog({
      body: `chronicon.browser.${body}`,
      level,
      attributes: { ...context(), ...safeProperties(properties) },
      trace_id: Schema.is(Schema.String)(properties.trace_id) ? properties.trace_id : undefined,
      span_id: Schema.is(Schema.String)(properties.span_id) ? properties.span_id : undefined,
    }),
  );
}

export function captureError(
  error: Schema.Schema.Type<typeof Schema.Unknown>,
  properties: TelemetryProperties = {},
) {
  if (!initialized) return;

  const errorObject =
    error instanceof Error || Schema.is(Schema.JsonObject)(error) ? error : undefined;

  if (errorObject) {
    if (capturedErrors.has(errorObject)) return;
    capturedErrors.add(errorObject);
  }

  bestEffort(() => {
    const safeError = new Error("Unexpected client error");

    if (error instanceof Error) {
      safeError.name = /^(?:Type|Range|Reference|Syntax|URI|Eval)?Error$/.test(error.name)
        ? error.name
        : "Error";
      safeError.stack = `${safeError.name}: Unexpected client error\n${(error.stack ?? "")
        .split("\n")
        .slice(1)
        .filter((line) => line.includes("/_next/static/"))
        .join("\n")}`;
    }

    posthog.captureException(safeError, { ...context(), ...safeProperties(properties) });
    wideLog("error", { ...properties, outcome: "failure" }, "error");
  });
}
