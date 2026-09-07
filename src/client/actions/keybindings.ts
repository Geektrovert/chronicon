import { Effect, Schema } from "effect";
import { ClientError } from "../errors";
import { bindingError, defaultBindings, type Keybindings } from "@/lib/keybindings";
const storageKey = "chronicon.keybindings.v1";
const codec = Schema.fromJsonString(
  Schema.Struct({
    search: Schema.String,
    projectSearch: Schema.String,
    document: Schema.String,
    project: Schema.String,
    agents: Schema.String,
    library: Schema.String,
    starred: Schema.String,
    archive: Schema.String,
    refresh: Schema.String,
    shortcuts: Schema.String,
  }),
);
export const loadKeybindings = Effect.gen(function* () {
  const raw = yield* Effect.try(() => localStorage.getItem(storageKey));
  if (!raw) return defaultBindings;
  const decoded = yield* Schema.decodeEffect(codec)(raw);
  if (bindingError(decoded)) return yield* new ClientError({ message: "Invalid saved shortcuts." });
  return decoded;
}).pipe(
  Effect.mapError(
    () => new ClientError({ message: "Saved shortcuts could not be loaded. Defaults are active." }),
  ),
);
export const saveKeybindings = (bindings: Keybindings) =>
  Effect.gen(function* () {
    const error = bindingError(bindings);
    if (error) return yield* new ClientError({ message: error });
    const raw = yield* Schema.encodeEffect(codec)(bindings).pipe(
      Effect.mapError(() => new ClientError({ message: "Unable to encode shortcuts." })),
    );
    yield* Effect.try({
      try: () => localStorage.setItem(storageKey, raw),
      catch: () =>
        new ClientError({
          message: "Shortcuts could not be saved. Allow browser storage and try again.",
        }),
    });
  });
