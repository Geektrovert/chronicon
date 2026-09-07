import { Effect, Schema } from "effect";
import type { HttpMethod } from "effect/unstable/http/HttpMethod";
import { Api } from "../services/api";
import { ClientError } from "../errors";
import { leaveWorkspace } from "./session";

const errorSchema = Schema.Struct({ error: Schema.String });

// Workspace policy sits above the HTTP service, including where a lost session sends the user.
export const request = Effect.fn("Client.request")(function* <
  S extends Schema.ConstraintDecoder<unknown>,
>(schema: S, path: string, options?: { method?: HttpMethod; body?: unknown }) {
  const { status, body } = yield* Api.use((api) =>
    api.request({ url: new URL(path, window.location.origin).href, ...options }),
  ).pipe(
    Effect.mapError(
      (error) =>
        new ClientError({
          message:
            error.operation === "request"
              ? "Check your connection and try again."
              : "The server returned an unreadable response. Try again.",
        }),
    ),
  );
  if (status < 200 || status >= 300) {
    if (status === 401) yield* leaveWorkspace;
    const error = yield* Schema.decodeUnknownEffect(errorSchema)(body).pipe(
      Effect.orElseSucceed(() => ({ error: "Unable to complete the request. Try again." })),
    );
    return yield* new ClientError({ status, message: error.error });
  }
  return yield* Schema.decodeEffect(schema)(body).pipe(
    Effect.mapError(
      () =>
        new ClientError({
          message: "The server returned unexpected data. Reload and try again.",
        }),
    ),
  );
});
