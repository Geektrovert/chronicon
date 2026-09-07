import { Effect } from "effect";
import { ClientError } from "../errors";

export const readHtmlFile = Effect.fn("Client.readHtmlFile")(function* (file: File) {
  if (file.size > 2_000_000)
    return yield* new ClientError({ message: "Choose an HTML file smaller than 2 MB." });
  const html = yield* Effect.tryPromise({
    try: () => file.text(),
    catch: () => new ClientError({ message: "Unable to read that file. Try choosing it again." }),
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return { html, title: parsed.title || file.name.replace(/\.html?$/i, "").replace(/[-_]/g, " ") };
});
export const copyText = (text: string, message: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: () => new ClientError({ message }),
  });
export const fullscreen = (element: HTMLElement) =>
  Effect.tryPromise({
    try: () => element.requestFullscreen(),
    catch: () => new ClientError({ message: "Fullscreen is unavailable in this browser." }),
  });
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
  );
});
