import { Effect, Schema, Stream } from "effect";
import { previewNavigation, previewRoute } from "@/lib/preview";

export const watchPreviewNavigation = (
  frame: HTMLIFrameElement,
  navigate: (href: string) => void,
) =>
  Stream.fromEventListener<MessageEvent<unknown>>(window, "message").pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (
          !frame.contentWindow ||
          event.source !== frame.contentWindow ||
          event.origin !== "null" ||
          !Schema.is(previewNavigation)(event.data)
        )
          return;
        const href = previewRoute(event.data.href, window.location.origin);

        if (href) navigate(href);
      }),
    ),
  );

export const revealPreviewFragment = (frame: HTMLIFrameElement, hash: string) =>
  Effect.sync(() => {
    if (hash.startsWith("#"))
      // An opaque srcdoc origin requires "*". This sends only a URL fragment to
      // the exact preview window, never session data or credentials.
      frame.contentWindow?.postMessage({ type: "chronicon:preview:fragment", hash }, "*");
  });
