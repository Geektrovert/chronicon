import { Effect, Schema } from "effect";

export class ClientError extends Schema.TaggedError<ClientError>()("ClientError", {
  message: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
}) {}
export const decodeClient = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      () => new ClientError({ message: "Check the submitted fields and try again." }),
    ),
  );
