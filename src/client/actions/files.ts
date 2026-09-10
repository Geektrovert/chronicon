import { Effect, Stream } from "effect";
import { ClientError } from "../errors";
import { observeAction } from "../observe-action";

export const readHtmlFile = Effect.fn("Client.readHtmlFile")(function* (file: File) {
  if (file.size > 2_000_000)
    return yield* new ClientError({ message: "Choose an HTML file of 2 MB or less." });
  const html = yield* Effect.tryPromise({
    try: () => file.text(),
    catch: () => new ClientError({ message: "Unable to read that file. Try choosing it again." }),
  }).pipe(observeAction("html_import", { file_bytes: file.size }));
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return { html, title: parsed.title || file.name.replace(/\.html?$/i, "").replace(/[-_]/g, " ") };
});
export const copyText = (text: string, message: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: () => new ClientError({ message }),
  });
export const toggleFullscreen = Effect.tryPromise({
  try: () =>
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen(),
  catch: () => new ClientError({ message: "Fullscreen is unavailable in this browser." }),
});

export const watchFullscreen = (onChange: (expanded: boolean) => void) =>
  Effect.gen(function* () {
    const update = Effect.sync(() => onChange(document.fullscreenElement !== null));
    yield* update;
    yield* Stream.fromEventListener(document, "fullscreenchange").pipe(
      Stream.runForEach(() => update),
    );
  }).pipe(
    Effect.ensuring(
      Effect.tryPromise({
        try: () =>
          document.fullscreenElement === document.documentElement
            ? document.exitFullscreen()
            : Promise.resolve(),
        catch: () => new ClientError({ message: "Unable to leave fullscreen. Press Escape." }),
      }).pipe(Effect.ignore),
    ),
  );
export const downloadHtml = Effect.fn("Client.downloadHtml")(function* (
  html: string,
  filename: string,
) {
  yield* Effect.acquireUseRelease(
    Effect.sync(() => URL.createObjectURL(new Blob([html], { type: "text/html" }))),
    (url) =>
      Effect.gen(function* () {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        yield* Effect.sleep("1 second");
      }),
    (url) => Effect.sync(() => URL.revokeObjectURL(url)),
  ).pipe(observeAction("document_download"));
});
