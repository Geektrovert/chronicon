import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Effect } from "effect";
import { runObservedPage } from "@/server/request-telemetry";
import { readPublicProject } from "@/server/actions/public";
import { LoadingState } from "@/components/ui/loading-state";
// oxlint-disable-next-line effecttsgo/async-function -- Next server page boundary.
async function PublicProjectPage({ params }: PageProps<"/public/projects/[id]">) {
  await connection();
  const { id } = await params;
  const data = await runObservedPage(
    "page.public_project",
    "/public/projects/[id]",
    readPublicProject(id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
  if (!data) notFound();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground">
        Chronicon
      </Link>
      <h1 className="content-title mt-10 text-3xl">{data.project.name}</h1>
      {data.project.description && (
        <p className="content-description mt-3">{data.project.description}</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Public project · Read only</p>
      <div className="mt-8 divide-y rounded-lg border">
        {data.documents.map((document) => (
          <Link
            key={document.id}
            href={document.publicPath}
            prefetch={false}
            className="block p-5 hover:bg-muted/50"
          >
            <h2 className="content-title-sm">{document.title}</h2>
            {document.summary && <p className="content-description mt-2">{document.summary}</p>}
          </Link>
        ))}
        {!data.documents.length && (
          <p className="p-5 text-sm text-muted-foreground">No published documents.</p>
        )}
      </div>
    </main>
  );
}

export default function Page(props: PageProps<"/public/projects/[id]">) {
  return (
    <Suspense fallback={<LoadingState>Opening shared project…</LoadingState>}>
      <PublicProjectPage {...props} />
    </Suspense>
  );
}
