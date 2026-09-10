import { captureError, initializeTelemetry } from "./client/telemetry";

initializeTelemetry();
window.addEventListener("error", (event) => {
  if (event.error) captureError(event.error, { source: "window" });
});
window.addEventListener("unhandledrejection", (event) => {
  captureError(event.reason, { source: "unhandled_rejection" });
});
