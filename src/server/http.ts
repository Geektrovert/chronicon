import { Cause, Effect, Exit, Option, Schema, Stream } from "effect";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AppError, DatabaseError, StorageError } from "./errors";
import { LibraryInvalidation, requestLibraryInvalidation } from "./cache";
import { runtime, type AppServices } from "./runtime";

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
  Effect.runSync(
    Effect.logError(
      "Chronicon request failed.",
      Option.isSome(error) &&
        (Schema.is(DatabaseError)(error.value) || Schema.is(StorageError)(error.value))
        ? { error: error.value._tag, operation: error.value.operation }
        : { error: "UnexpectedError" },
    ),
  );
  return { status: 500, message: "Unable to complete the request. Try again." };
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
  return runtime.runPromiseExit(scoped, { signal: request.signal }).then((exit) => {
    if (Exit.isSuccess(exit))
      return exit.value instanceof Response
        ? exit.value
        : Response.json(exit.value, { headers: privateHeaders });
    const error = failure(exit.cause);
    return Response.json(
      { error: error.message },
      { status: error.status, headers: privateHeaders },
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
