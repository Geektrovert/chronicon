import { Clock, Effect, Stream } from "effect";

const signOutKey = "chronicon.signed-out";

export const leaveWorkspace = Effect.sync(() => window.location.replace("/sign-in"));

// Only an event marker is stored. Sessions and credentials remain in HttpOnly cookies.
export const announceSignOut = Clock.currentTimeMillis.pipe(
  Effect.flatMap((time) => Effect.try(() => localStorage.setItem(signOutKey, String(time)))),
  Effect.ignore,
);

export const watchSessionEnd = Effect.gen(function* () {
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "storage").pipe(
      Stream.runForEach((event) =>
        event instanceof StorageEvent && event.key === signOutKey ? leaveWorkspace : Effect.void,
      ),
    ),
  );
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "pageshow").pipe(
      Stream.runForEach((event) =>
        event instanceof PageTransitionEvent && event.persisted
          ? Effect.sync(() => window.location.reload())
          : Effect.void,
      ),
    ),
  );
  return yield* Effect.never;
}).pipe(Effect.scoped);
