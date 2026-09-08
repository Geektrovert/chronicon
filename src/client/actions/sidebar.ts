import { DateTime, Effect, Schedule, Stream } from "effect";
import { ClientError } from "../errors";

const storageKey = "chronicon.sidebar.collapsed";

export const loadSidebarCollapsed = Effect.try({
  try: () => localStorage.getItem(storageKey) === "true",
  catch: () => new ClientError({ message: "Sidebar preference could not be loaded." }),
});

export const saveSidebarCollapsed = (collapsed: boolean) =>
  Effect.try({
    try: () => localStorage.setItem(storageKey, String(collapsed)),
    catch: () => new ClientError({ message: "Sidebar preference could not be saved." }),
  });

export const watchSidebarTime = (onTick: (now: DateTime.Utc) => void) =>
  DateTime.now.pipe(
    Effect.flatMap((now) => Effect.sync(() => onTick(now))),
    Effect.repeat(Schedule.spaced("1 minute")),
  );

export const watchSidebarViewport = (onChange: (mobile: boolean) => void) =>
  Effect.gen(function* () {
    const viewport = yield* Effect.sync(() => window.matchMedia("(max-width: 820px)"));
    yield* Effect.sync(() => onChange(viewport.matches));
    yield* Stream.fromEventListener<MediaQueryListEvent>(viewport, "change").pipe(
      Stream.runForEach((event) => Effect.sync(() => onChange(event.matches))),
    );
  });
