import { Effect, Schema } from "effect";

export class CliError extends Schema.TaggedError<CliError>()("CliError", {
  message: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
}) {}

export const attempt = <A>(message: string, work: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: () => new CliError({ message }) });

export const decode = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () => new CliError({ message: "Invalid data. Check the command input or update the CLI." }),
    ),
  );

export const json = (value: string): unknown => JSON.parse(value);

export function hasCode(error: unknown, code: string) {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}
