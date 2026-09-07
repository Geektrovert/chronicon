import { Effect, Schema } from "effect";

export class AppError extends Schema.TaggedError<AppError>()("AppError", {
  status: Schema.Finite,
  message: Schema.String,
}) {}
export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  operation: Schema.String,
}) {}
export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.String,
}) {}
export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "ConfigurationError",
  {
    message: Schema.String,
  },
) {}
export class AuthenticationError extends Schema.TaggedError<AuthenticationError>()(
  "AuthenticationError",
  {},
) {}

// Never attach raw SDK/database causes: they can contain credentials, HTML, or SQL parameters.
export const decodeInput = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () => new AppError({ status: 400, message: "Check the submitted fields and try again." }),
    ),
  );
export const deny = (message = "You do not have access to this document.") =>
  Effect.fail(new AppError({ status: 403, message }));
