import { Effect, Schema } from "effect";

export class CliError extends Schema.TaggedError<CliError>()("CliError", {
  message: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
}) {}

export const attempt = <A>(message: string, work: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: () => new CliError({ message }) });

export const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: Schema.Json,
) =>
  Schema.decodeEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () =>
        new CliError({
          message: "Unable to read this data. Check the command input and CLI version.",
        }),
    ),
  );

export const json = (value: string): Schema.Json => {
  // oxlint-disable-next-line effecttsgo/schema-sync -- JSON input is parsed synchronously at the CLI file boundary.
  return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(value));
};

export function hasCode(error: Schema.Schema.Type<typeof Schema.Unknown>, code: string) {
  return Schema.is(Schema.JsonObject)(error) && error.code === code;
}
