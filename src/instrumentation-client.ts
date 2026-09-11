import { captureError, initializeTelemetry } from "./client/telemetry";

initializeTelemetry();

globalThis.addEventListener?.("error", (event) => {
  if (event instanceof ErrorEvent && event.error instanceof Error)
    captureError(event.error, { source: "window" });
});

globalThis.addEventListener?.("unhandledrejection", (event) => {
  if (event instanceof PromiseRejectionEvent && event.reason instanceof Error)
    captureError(event.reason, { source: "unhandled_rejection" });
});
