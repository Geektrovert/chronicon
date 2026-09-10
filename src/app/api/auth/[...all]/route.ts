import { Exit } from "effect";
import { Auth, authCall } from "@/server/auth";
import { failure, privateHeaders } from "@/server/http";
import { runObservedRequest, telemetryResponseHeaders } from "@/server/request-telemetry";
const handle = (request: Request) =>
  runObservedRequest(
    request.headers,
    request.method,
    new URL(request.url).pathname,
    Auth.use((auth) => authCall(() => auth.handler(request))),
    { signal: request.signal, event: "chronicon_auth_completed" },
  ).then(({ exit, state }) => {
    if (Exit.isSuccess(exit)) {
      return telemetryResponseHeaders(exit.value, state, privateHeaders);
    }
    const error = failure(exit.cause);
    return telemetryResponseHeaders(
      Response.json({ message: error.message }, { status: error.status, headers: privateHeaders }),
      state,
    );
  });
export const GET = handle;
export const POST = handle;
