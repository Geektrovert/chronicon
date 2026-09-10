import { Cause, Effect, Exit, Option, Schema, Stream } from "effect";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "./errors";
import { LibraryInvalidation, requestLibraryInvalidation } from "./cache";
import { type AppServices } from "./runtime";
import { runObservedRequest, telemetryResponseHeaders } from "./request-telemetry";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function failure(cause: Cause.Cause<unknown>) {
  unstable_rethrow(Cause.squash(cause));
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error) && Schema.is(AppError)(error.value))
    return { status: error.value.status, message: error.value.message };
  if (Cause.hasInterruptsOnly(cause)) return { status: 499, message: "Request cancelled." };
  return {
    status: 500,
    message: "Unable to confirm the result. Refresh to check for changes before trying again.",
  };
}
// oxlint-disable-next-line effecttsgo/async-function -- Next's connection() must run before entering the Effect runtime.
export async function route<A, E>(
  request: Request,
  program: Effect.Effect<A, E, AppServices | LibraryInvalidation>,
) {
  await connection();
  const scoped = program.pipe(
    Effect.provideService(LibraryInvalidation, requestLibraryInvalidation()),
  );
  return runObservedRequest(
    request.headers,
    request.method,
    new URL(request.url).pathname,
    scoped,
    { signal: request.signal },
  ).then(({ exit, state }) => {
    if (Exit.isSuccess(exit)) {
      const response =
        exit.value instanceof Response
          ? exit.value
          : Response.json(exit.value, { headers: privateHeaders });
      return telemetryResponseHeaders(response, state, privateHeaders);
    }
    const error = failure(exit.cause);
    return telemetryResponseHeaders(
      Response.json({ error: error.message }, { status: error.status, headers: privateHeaders }),
      state,
    );
  });
}

export const readBody = Effect.fn("Http.readBody")(function* (request: Request) {
  if (!request.body) return "";
  const body = request.body;
  const decoder = new TextDecoder();
  const { text } = yield* Stream.fromReadableStream({
    evaluate: () => body,
    onError: () => new AppError({ status: 400, message: "Unable to read the request body." }),
  }).pipe(
    Stream.runFoldEffect(
      () => ({ bytes: 0, text: "" }),
      (acc, chunk) => {
        const bytes = acc.bytes + chunk.byteLength;
        return bytes > 3_000_000
          ? Effect.fail(new AppError({ status: 413, message: "Keep the request under 3 MB." }))
          : Effect.succeed({ bytes, text: acc.text + decoder.decode(chunk, { stream: true }) });
      },
    ),
  );
  return text + decoder.decode();
});

export const readJSON = Effect.fn("Http.readJSON")(function* (request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    return yield* new AppError({ status: 415, message: "Send an application/json request." });
  if (!request.body) return yield* new AppError({ status: 400, message: "Send a request body." });
  const text = yield* readBody(request);
  return yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
    Effect.mapError(() => new AppError({ status: 400, message: "Send valid JSON." })),
  );
});
