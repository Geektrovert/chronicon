import { Effect } from "effect";
import { updateDesignBody } from "@/lib/project-design/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readProjectDesign, updateProjectDesign } from "@/server/actions/project-design";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

// oxlint-disable-next-line effecttsgo/async-function -- Next resolves route params at the transport boundary.
export async function GET(request: Request, context: RouteContext<"/api/projects/[id]/design">) {
  const { id } = await context.params;
  return route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      return yield* readProjectDesign(principal, { project: { id } });
    }),
  );
}

// oxlint-disable-next-line effecttsgo/async-function -- Next resolves route params at the transport boundary.
export async function PUT(request: Request, context: RouteContext<"/api/projects/[id]/design">) {
  const { id } = await context.params;
  return route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const input = yield* decodeInput(updateDesignBody, yield* readJSON(request));
      return yield* updateProjectDesign(principal, { ...input, project: { id } });
    }),
  );
}
