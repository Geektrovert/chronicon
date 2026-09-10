import "server-only";
import { cache } from "react";
import { Effect } from "effect";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { authenticate, ownerAccess } from "./actions/access";
import { findDocument, readDocument } from "./actions/documents";
import { findProject } from "./actions/projects";
import { loadProjectLibrary } from "./actions/library";
import { readCachedLibrary } from "./cache";
import { runObservedPage } from "./request-telemetry";

// React cache deduplicates this render only. Every request rechecks the session and grants.
// oxlint-disable-next-line effecttsgo/async-function -- Next headers and React cache are framework boundaries.
export const pagePrincipal = cache(async () => {
  await connection();
  const requestHeaders = await headers();
  return runObservedPage(
    "page.authenticate",
    "/",
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
  await connection();
  const principal = await pagePrincipal();
  if (!principal) return null;
  return {
    userId: principal.ownerId,
    name: principal.name,
    library: await runObservedPage("page.workspace", "/", readCachedLibrary(principal), principal),
  };
});

// oxlint-disable-next-line effecttsgo/async-function -- Translate domain results into Next navigation at the page boundary.
export const projectPageData = cache(async (slug: string) => {
  const workspace = await workspaceData();
  if (!workspace) redirect(`/sign-in?next=${encodeURIComponent(`/projects/${slug}`)}`);
  const project = workspace.library.projects.find((project) => project.id === slug);
  if (project) return project;
  // External publishers can create a project before this browser's library refreshes.
  const principal = await requirePageOwner(`/projects/${slug}`);
  const current = await runObservedPage(
    "page.project",
    "/projects/[slug]",
    findProject(
      principal,
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(slug) ? { id: slug } : { slug },
    ).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
    principal,
  );
  if (!current) notFound();
  return current;
});

// oxlint-disable-next-line effecttsgo/async-function -- Metadata and the immediate heading reuse the authorized library.
export const documentPageHeader = cache(async (id: string) => {
  const workspace = await workspaceData();
  if (!workspace) redirect(`/sign-in?next=${encodeURIComponent(`/documents/${id}`)}`);
  const document = workspace.library.documents.find((document) => document.id === id);
  const project = workspace.library.projects.find((project) => project.id === document?.projectId);
  if (document && project) return { document, project };
  // External publishers can add documents before the library cache refreshes.
  const principal = await requirePageOwner(`/documents/${id}`);
  const current = await runObservedPage(
    "page.document_header",
    "/documents/[id]",
    findDocument(principal, id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
    principal,
  );
  if (!current) notFound();
  return current;
});

// oxlint-disable-next-line effecttsgo/async-function -- Translate domain results into Next navigation at the page boundary.
export const documentPageData = cache(async (id: string) => {
  const principal = await pagePrincipal();
  if (!principal) redirect(`/sign-in?next=${encodeURIComponent(`/documents/${id}`)}`);
  const report = await runObservedPage(
    "page.document",
    "/documents/[id]",
    readDocument(principal, id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
    principal,
  );
  if (!report) notFound();
  return report;
});

// oxlint-disable-next-line effecttsgo/async-function -- Request-scoped project data for links outside the active team.
export const projectLibraryPageData = cache(async (reference: string) => {
  const project = await projectPageData(reference);
  const principal = await requirePageOwner(`/projects/${project.id}`);
  const library = await runObservedPage(
    "page.project_library",
    "/projects/[slug]",
    loadProjectLibrary(principal, project.id).pipe(
      Effect.catchTag("AppError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    ),
    principal,
  );
  if (!library) notFound();
  return { project: library.projects[0]!, library };
});
