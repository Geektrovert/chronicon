import { Clock, Effect, Ref, Semaphore, Stream } from "effect";
import { loadLibrary, loadProjectLibrary } from "./library";
import type { Library } from "@/lib/model";

export const watchLibrary = Effect.fn("Client.watchLibrary")(function* (
  receive: (library: Library) => void,
  projectId?: string,
) {
  const lastInteraction = yield* Ref.make(yield* Clock.currentTimeMillis);
  const refreshGate = yield* Semaphore.make(1);
  const active = Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) => Ref.set(lastInteraction, now)),
  );
  const reload = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (document.visibilityState !== "visible" || now - (yield* Ref.get(lastInteraction)) > 120_000)
      return;
    yield* (projectId ? loadProjectLibrary(projectId) : loadLibrary).pipe(
      Effect.tap((library) => Effect.sync(() => receive(library))),
      Effect.ignore,
    );
  }).pipe((effect) => refreshGate.withPermit(effect));
  if (projectId) yield* reload;
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "pointerdown", { passive: true }).pipe(
      Stream.runForEach(() => active),
    ),
  );
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "keydown").pipe(Stream.runForEach(() => active)),
  );
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, "focus").pipe(
      Stream.runForEach(() => active.pipe(Effect.andThen(reload))),
    ),
  );
  yield* Effect.forkScoped(reload.pipe(Effect.delay("1 minute"), Effect.forever));
  return yield* Effect.never;
}, Effect.scoped);
