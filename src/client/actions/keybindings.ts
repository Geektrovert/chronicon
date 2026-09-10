import { Effect, Schema } from "effect";
import { ClientError } from "../errors";
import { bindingError, defaultBindings, type Keybindings } from "@/lib/keybindings";
import { observeAction } from "../observe-action";
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
    sidebar: Schema.optionalKey(Schema.String),
  }),
);
export const loadKeybindings = Effect.gen(function* () {
  const raw = yield* Effect.try(() => localStorage.getItem(storageKey));
  if (!raw) return defaultBindings;
  const decoded = yield* Schema.decodeEffect(codec)(raw);
  const bindings = {
    ...decoded,
    sidebar:
      decoded.sidebar ??
      (Object.values(decoded).includes(defaultBindings.sidebar) ? "" : defaultBindings.sidebar),
  };
  if (bindingError(bindings))
    return yield* new ClientError({ message: "Invalid saved shortcuts." });
  return bindings;
}).pipe(
  Effect.mapError(
    () =>
      new ClientError({ message: "Unable to load saved shortcuts. Default shortcuts are active." }),
  ),
);
export const saveKeybindings = (bindings: Keybindings) =>
  Effect.gen(function* () {
    const error = bindingError(bindings);
    if (error) return yield* new ClientError({ message: error });
    const raw = yield* Schema.encodeEffect(codec)(bindings).pipe(
      Effect.mapError(
        () =>
          new ClientError({
            message: "Unable to save shortcuts. Reset to defaults and try again.",
          }),
      ),
    );
    yield* Effect.try({
      try: () => localStorage.setItem(storageKey, raw),
      catch: () =>
        new ClientError({
          message: "Unable to save shortcuts. Allow site storage in your browser and try again.",
        }),
    });
  }).pipe(observeAction("keyboard_settings_save"));
