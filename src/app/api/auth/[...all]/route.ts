import { Exit } from "effect";
import { Auth, authCall } from "@/server/auth";
import { runtime } from "@/server/runtime";
import { failure, privateHeaders } from "@/server/http";
const handle = (request: Request) =>
  runtime
    .runPromiseExit(
      Auth.use((auth) => authCall(() => auth.handler(request))),
      { signal: request.signal },
    )
    .then((exit) => {
      if (Exit.isSuccess(exit)) {
        for (const [name, value] of Object.entries(privateHeaders))
          exit.value.headers.set(name, value);
        return exit.value;
      }
      const error = failure(exit.cause);
      return Response.json(
        { message: error.message },
        { status: error.status, headers: privateHeaders },
      );
    });
export const GET = handle;
export const POST = handle;
