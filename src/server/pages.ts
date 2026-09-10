import "server-only";
import { cache } from "react";
import { Effect } from "effect";
import { headers } from "next/headers";
import { cacheLife } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { authenticate, ownerAccess } from "./actions/access";
import { findDocument, readDocument } from "./actions/documents";
import { findProject } from "./actions/projects";
import { readCachedLibrary } from "./cache";
import { runtime } from "./runtime";

// React cache deduplicates a render; private cache lets Next reuse authorized UI
// in this browser. It never stores sessions on the server or skips API auth.
// oxlint-disable-next-line effecttsgo/async-function -- Next headers and React cache are framework boundaries.
export const pagePrincipal = cache(async () => {
  "use cache: private";
  cacheLife({ stale: 300 });
  const requestHeaders = await headers();
  return runtime.runPromise(
    authenticate(requestHeaders).pipe(
      Effect.tap(ownerAccess),
      Effect.catchTag("AppError", (error) =>
        error.status === 401 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
});

// oxlint-disable-next-line effecttsgo/async-function -- Redirect at the Next page boundary, outside the Effect runtime.
export async function requirePageOwner(pathname: string) {
  const principal = await pagePrincipal();
  if (!principal) redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);
  return principal;
}

// oxlint-disable-next-line effecttsgo/async-function -- Request-scoped React data loader for server components.
export const workspaceData = cache(async () => {
  "use cache: private";
  cacheLife({ stale: 300 });
  const principal = await pagePrincipal();
  if (!principal) return null;
  return {
    name: principal.name,
    library: await runtime.runPromise(readCachedLibrary(principal)),
  };
});

// oxlint-disable-next-line effecttsgo/async-function -- Translate domain results into Next navigation at the page boundary.
export const projectPageData = cache(async (slug: string) => {
  "use cache: private";
  cacheLife({ stale: 300 });
  const workspace = await workspaceData();
  if (!workspace) redirect(`/sign-in?next=${encodeURIComponent(`/projects/${slug}`)}`);
  const project = workspace.library.projects.find((project) => project.slug === slug);
  if (project) return project;
  // External publishers can create a project before this browser's library refreshes.
  const principal = await requirePageOwner(`/projects/${slug}`);
  const current = await runtime.runPromise(
    findProject(principal, { slug }).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
  if (!current) notFound();
  return current;
});

// oxlint-disable-next-line effecttsgo/async-function -- Metadata and the immediate heading reuse the authorized library.
export const documentPageHeader = cache(async (id: string) => {
  "use cache: private";
  cacheLife({ stale: 300 });
  const workspace = await workspaceData();
  if (!workspace) redirect(`/sign-in?next=${encodeURIComponent(`/documents/${id}`)}`);
  const document = workspace.library.documents.find((document) => document.id === id);
  const project = workspace.library.projects.find((project) => project.id === document?.projectId);
  if (document && project) return { document, project };
  // External publishers can add documents before the library cache refreshes.
  const principal = await requirePageOwner(`/documents/${id}`);
  const current = await runtime.runPromise(
    findDocument(principal, id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
  if (!current) notFound();
  return current;
});

// oxlint-disable-next-line effecttsgo/async-function -- Translate domain results into Next navigation at the page boundary.
export const documentPageData = cache(async (id: string) => {
  "use cache: private";
  cacheLife({ stale: 300 });
  const principal = await pagePrincipal();
  if (!principal) redirect(`/sign-in?next=${encodeURIComponent(`/documents/${id}`)}`);
  const report = await runtime.runPromise(
    readDocument(principal, id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
  );
  if (!report) notFound();
  return report;
});
