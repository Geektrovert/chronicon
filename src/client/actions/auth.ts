"use client";
import { Effect, Redacted, Schema } from "effect";
import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient, organizationClient, usernameClient } from "better-auth/client/plugins";
import { ClientError } from "../errors";
import { announceSignOut, leaveWorkspace } from "./session";
import { signInDestination } from "@/lib/cli-auth";
import { observeAction } from "../observe-action";
import { identifyUser, resetIdentity } from "../telemetry";
import { prepareRequestTelemetry } from "../services/request-telemetry";
const authClient = createAuthClient({
  plugins: [
    apiKeyClient(),
    organizationClient(),
    adminClient(),
    usernameClient({ displayUsername: false }),
  ],
});
const authenticationContext = prepareRequestTelemetry({
  method: "POST",
  route: "/api/auth/[operation]",
  sampled: true,
});
const credentials = Schema.Struct({
  email: Schema.String.check(Schema.isMinLength(1)),
  password: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(""))),
});
const passwordAuthentication = Effect.fn("Client.passwordAuthentication")(function* (
  input: unknown,
  create: boolean,
) {
  const correlation = yield* authenticationContext;
  const values = yield* Schema.decodeUnknownEffect(credentials)(input).pipe(
    Effect.mapError(() => new ClientError({ message: "Enter your email and password." })),
  );
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => Redacted.make(values.password)),
    (password) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: (signal) => {
            const next = new URLSearchParams(window.location.search).get("next");
            const fields = { email: values.email, password: Redacted.value(password) };
            return create
              ? authClient.signUp.email(
                  { ...fields, name: values.name.trim(), callbackURL: signInDestination(next) },
                  { signal, headers: correlation.headers },
                )
              : authClient.signIn.email(fields, { signal, headers: correlation.headers });
          },
          catch: () =>
            new ClientError({
              message: create
                ? "Account creation could not be confirmed. Try signing in before creating another account."
                : "Sign-in could not be confirmed. Refresh to check whether you're signed in before trying again.",
            }),
        });
        if (result.error)
          return yield* new ClientError({
            message: result.error.message || "Check your email and password and try again.",
          });
        if (result.data?.user?.id) identifyUser(result.data.user.id);
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.replace(signInDestination(next));
      }),
    (password) =>
      Effect.sync(() => {
        Redacted.wipeUnsafe(password);
      }),
  );
});
export const signIn = (input: unknown) =>
  passwordAuthentication(input, false).pipe(observeAction("sign_in"));
export const signUp = (input: unknown) =>
  passwordAuthentication(input, true).pipe(observeAction("sign_up"));
export const requestEmailVerification = Effect.fn("Client.requestEmailVerification")(function* (
  email: string,
  callbackPath: string,
) {
  const correlation = yield* authenticationContext;
  const result = yield* Effect.tryPromise({
    try: (signal) =>
      authClient.sendVerificationEmail(
        { email, callbackURL: signInDestination(callbackPath) },
        { signal, headers: correlation.headers },
      ),
    catch: () =>
      new ClientError({
        message:
          "Email delivery could not be confirmed. Check your inbox before requesting another email.",
      }),
  });
  if (result.error)
    return yield* new ClientError({
      message:
        result.error.message ||
        "Email delivery could not be confirmed. Check your inbox before requesting another email.",
    });
}, observeAction("email_verification_request"));
const endSession = Effect.gen(function* () {
  const correlation = yield* authenticationContext;
  const result = yield* Effect.tryPromise({
    try: (signal) => authClient.signOut({ fetchOptions: { signal, headers: correlation.headers } }),
    catch: () =>
      new ClientError({
        message:
          "Sign-out could not be confirmed. Refresh to check whether you're signed out before trying again.",
      }),
  });
  if (result.error) return yield* new ClientError({ message: "Unable to sign out. Try again." });
  yield* announceSignOut;
}).pipe(observeAction("sign_out"));
export const signOut = endSession.pipe(Effect.andThen(leaveWorkspace));
export const signOutTo = (callbackPath: string) =>
  endSession.pipe(
    Effect.andThen(
      Effect.sync(() => {
        resetIdentity();
        const next = encodeURIComponent(signInDestination(callbackPath));
        window.location.replace(`/sign-in?next=${next}`);
      }),
    ),
  );
