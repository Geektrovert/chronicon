import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Effect } from "effect";
import { runObservedPage } from "@/server/request-telemetry";
import { readPublicDocument } from "@/server/actions/public";
import { ReportPreview } from "@/components/report-preview";
import { LoadingState } from "@/components/ui/loading-state";
// oxlint-disable-next-line effecttsgo/async-function -- Next server page boundary.
async function PublicDocumentPage({ params }: PageProps<"/public/documents/[id]">) {
  await connection();
  const { id } = await params;
  const data = await runObservedPage(
    "page.public_document",
    "/public/documents/[id]",
    readPublicDocument(id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
  if (!data) notFound();
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          {data.document.publicProjectId && (
            <Link
              prefetch={false}
              href={`/public/projects/${data.document.publicProjectId}`}
              className="text-xs text-muted-foreground"
            >
              {data.document.publicProjectName}
            </Link>
          )}
          <h1 className="content-title-sm truncate">{data.document.title}</h1>
        </div>
        <span className="text-xs text-muted-foreground">Public document · Read only</span>
      </header>
      <div className="flex flex-1 [&>iframe]:min-h-[calc(100dvh-6rem)] [&>iframe]:w-full [&>iframe]:border-0">
        <ReportPreview html={data.html} title={data.document.title} />
      </div>
    </main>
  );
}

export default function Page(props: PageProps<"/public/documents/[id]">) {
  return (
    <Suspense fallback={<LoadingState>Opening shared document…</LoadingState>}>
      <PublicDocumentPage {...props} />
    </Suspense>
  );
}
