import { Effect } from "effect";
import { authenticate } from "@/server/actions/access";
import { readProjectDesign } from "@/server/actions/project-design";
import { privateHeaders, route } from "@/server/http";

// oxlint-disable-next-line effecttsgo/async-function -- Next resolves route params at the transport boundary.
export async function GET(request: Request, context: RouteContext<"/api/projects/[id]/design.md">) {
  const { id } = await context.params;

  return route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const design = yield* readProjectDesign(principal, { project: { id } });

      return new Response(design.markdown, {
        headers: {
          ...privateHeaders,
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="design.md"',
          "Content-Security-Policy": "sandbox; default-src 'none'",
        },
      });
    }),
  );
}
