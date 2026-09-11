import { Effect } from "effect";
import { connection, NextResponse } from "next/server";
import { readPublicDocumentLink } from "@/server/actions/public";
import { runObservedPage } from "@/server/request-telemetry";

// oxlint-disable-next-line effecttsgo/async-function -- Next route handler boundary.
export async function GET(request: Request, { params }: RouteContext<"/public/documents/[id]">) {
  await connection();
  const { id } = await params;

  const path = await runObservedPage(
    "public.document_redirect",
    "/public/documents/[id]",
    readPublicDocumentLink({ id }).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );

  const headers = { "Cache-Control": "private, no-store" };

  return path
    ? NextResponse.redirect(new URL(path, request.url), { status: 307, headers })
    : new NextResponse("Not found", { status: 404, headers });
}
