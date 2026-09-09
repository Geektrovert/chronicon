"use client";
import { Effect, Redacted, Schema } from "effect";
import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { ClientError } from "../errors";
import { announceSignOut, leaveWorkspace } from "./session";
import { signInDestination } from "@/lib/cli-auth";
const authClient = createAuthClient({ plugins: [apiKeyClient()] });
const credentials = Schema.Struct({
  email: Schema.String.check(Schema.isMinLength(1)),
  password: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(""))),
});
const passwordAuthentication = Effect.fn("Client.passwordAuthentication")(function* (
  input: unknown,
  create: boolean,
) {
  const values = yield* Schema.decodeUnknownEffect(credentials)(input).pipe(
    Effect.mapError(() => new ClientError({ message: "Enter your email and password." })),
  );
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => Redacted.make(values.password)),
    (password) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: (signal) => {
            const fields = { email: values.email, password: Redacted.value(password) };
            return create
              ? authClient.signUp.email({ ...fields, name: values.name.trim() }, { signal })
              : authClient.signIn.email(fields, { signal });
          },
          catch: () => new ClientError({ message: "Check your connection and try again." }),
        });
        if (result.error)
          return yield* new ClientError({
            message: result.error.message || "Check your email and password and try again.",
          });
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.replace(signInDestination(next));
      }),
    (password) =>
      Effect.sync(() => {
        Redacted.wipeUnsafe(password);
      }),
  );
});
export const signIn = (input: unknown) => passwordAuthentication(input, false);
export const signUp = (input: unknown) => passwordAuthentication(input, true);
export const signOut = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: (signal) => authClient.signOut({ fetchOptions: { signal } }),
    catch: () =>
      new ClientError({ message: "Unable to sign out. Check your connection and try again." }),
  });
  if (result.error) return yield* new ClientError({ message: "Unable to sign out. Try again." });
  yield* announceSignOut;
  yield* leaveWorkspace;
});
