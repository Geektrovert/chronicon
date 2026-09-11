import { Context, Effect, Exit, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { HttpMethod } from "effect/unstable/http/HttpMethod";
import { capture, requestSpan, telemetryRoute, wideLog } from "../telemetry";
import { prepareRequestTelemetry } from "./request-telemetry";

class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  operation: Schema.Literals(["request", "response"]),
}) {}

const makeApi = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  const request = Effect.fn("Api.request")(function* (input: {
    url: string;
    method?: HttpMethod;
    body?: unknown;
  }) {
    const started = performance.now();
    const startedAt = performance.timeOrigin + started;
    const route = telemetryRoute(new URL(input.url).pathname);

    const { headers, fields, action } = yield* prepareRequestTelemetry({
      method: input.method ?? "GET",
      route,
      sampled: route !== "/api/library",
    });

    let request = HttpClientRequest.make(input.method ?? "GET")(input.url).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeader("Cache-Control", "no-store"),
      HttpClientRequest.setHeaders(headers),
    );

    if (input.body !== undefined)
      request = request.pipe(HttpClientRequest.bodyJsonUnsafe(input.body));

    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        const response = yield* client
          .execute(request)
          .pipe(Effect.mapError(() => new ApiError({ operation: "request" })));

        const body = yield* response.json.pipe(
          Effect.mapError(() => new ApiError({ operation: "response" })),
        );

        return { status: response.status, body };
      }),
    );

    const status = Exit.isSuccess(exit) ? exit.value.status : undefined;
    const failed = status === undefined || status >= 400;
    yield* Effect.sync(() => {
      const durationMs = performance.now() - started;

      const completion = {
        ...fields,
        status,
        duration_ms: Math.round(durationMs),
        outcome: failed ? "failure" : "success",
      };

      if (route !== "/api/library") requestSpan(completion, startedAt, durationMs);

      if (action) action.request_span_recorded = true;

      // Library polling is represented by server logs, not repeated browser journey events.
      if (failed || fields.route !== "/api/library")
        wideLog("request", completion, failed ? "warn" : "info");

      if (failed) capture("request_failed", completion);
    });

    return Exit.isSuccess(exit) ? exit.value : yield* Effect.failCause(exit.cause);
  });

  return { request };
});

export class Api extends Context.Service<Api, Effect.Success<typeof makeApi>>()(
  "chronicon/client/Api",
) {
  static readonly layer = Layer.effect(Api, makeApi).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { cache: "no-store", credentials: "same-origin" }),
    ),
  );
}
