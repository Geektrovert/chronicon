import type { Instrumentation } from "next";

// oxlint-disable-next-line effecttsgo/async-function -- Next loads instrumentation before its server is ready.
export async function register() {
  // oxlint-disable-next-line effecttsgo/process-env -- Next statically replaces NEXT_RUNTIME to exclude Node dependencies from Edge bundles.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNextTelemetry } = await import("./server/next-telemetry");
    registerNextTelemetry();
  }
}

// oxlint-disable-next-line effecttsgo/async-function -- Next awaits this error reporting hook, including render failures.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // oxlint-disable-next-line effecttsgo/process-env -- Keep the Node-only error reporter out of Edge bundles.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./server/request-error");
  await reportRequestError(error, request, context);
};
