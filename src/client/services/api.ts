import { Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import type { HttpMethod } from "effect/unstable/http/HttpMethod";

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
    let request = HttpClientRequest.make(input.method ?? "GET")(input.url).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeader("Cache-Control", "no-store"),
    );
    if (input.body !== undefined)
      request = request.pipe(HttpClientRequest.bodyJsonUnsafe(input.body));
    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError(() => new ApiError({ operation: "request" })));
    const body = yield* response.json.pipe(
      Effect.mapError(() => new ApiError({ operation: "response" })),
    );
    return { status: response.status, body };
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
