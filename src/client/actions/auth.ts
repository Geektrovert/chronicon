"use client";
import { Effect, Redacted, Schema } from "effect";
import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { ClientError } from "../errors";
import { announceSignOut, leaveWorkspace } from "./session";
const authClient = createAuthClient({ plugins: [apiKeyClient()] });
const credentials = Schema.Struct({
  email: Schema.String.check(Schema.isMinLength(1)),
  password: Schema.String.check(Schema.isMinLength(1)),
});
export const signIn = Effect.fn("Client.signIn")(function* (input: unknown) {
  const values = yield* Schema.decodeUnknownEffect(credentials)(input).pipe(
    Effect.mapError(() => new ClientError({ message: "Enter your email and password." })),
  );
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => Redacted.make(values.password)),
    (password) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: (signal) =>
            authClient.signIn.email(
              { email: values.email, password: Redacted.value(password) },
              { signal },
            ),
          catch: () =>
            new ClientError({ message: "Unable to sign in. Check your connection and try again." }),
        });
        if (result.error)
          return yield* new ClientError({
            message: result.error.message || "Check your email and password and try again.",
          });
        const next = new URLSearchParams(window.location.search).get("next");
        const destination = yield* Effect.try({
          try: () => new URL(next || "/", window.location.origin),
          catch: () =>
            new ClientError({ message: "Signed in. Open the workspace from the home page." }),
        });
        // Only app pages are valid return destinations. Never return to sign-in or an API.
        const appPath = /^\/(?:$|starred\/?$|archive\/?$|projects\/[^/]+\/?$|documents\/[^/]+\/?$)/;
        window.location.replace(
          destination.origin === window.location.origin && appPath.test(destination.pathname)
            ? destination.pathname
            : "/",
        );
      }),
    (password) =>
      Effect.sync(() => {
        Redacted.wipeUnsafe(password);
      }),
  );
});
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
