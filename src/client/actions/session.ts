import { Clock, Effect, Stream } from "effect";
import { resetIdentity } from "../telemetry";

const signOutKey = "chronicon.signed-out";
const teamChangeKey = "chronicon.team-changed";

export const leaveWorkspace = Effect.sync(() => {
  resetIdentity();
  window.location.replace("/sign-in");
});

// Only an event marker is stored. Sessions and credentials remain in HttpOnly cookies.
export const announceSignOut = Clock.currentTimeMillis.pipe(
  Effect.flatMap((time) => Effect.try(() => localStorage.setItem(signOutKey, String(time)))),
  Effect.ignore,
);

export const announceTeamChange = Clock.currentTimeMillis.pipe(
  Effect.flatMap((time) => Effect.try(() => localStorage.setItem(teamChangeKey, String(time)))),
  Effect.ignore,
);

export const watchSessionEnd = Effect.gen(function* () {
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "storage").pipe(
      Stream.runForEach((event) => {
        if (!(event instanceof StorageEvent)) return Effect.void;
        if (event.key === signOutKey) return leaveWorkspace;
        return event.key === teamChangeKey
          ? Effect.sync(() => window.location.assign("/"))
          : Effect.void;
      }),
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
