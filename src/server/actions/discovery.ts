import { Effect } from "effect";
import type { Principal } from "@/lib/model";
import { AppConfig } from "../config";
import { readCachedLibrary } from "../cache";
import { SearchService } from "../services/search";
import { findProject } from "./projects";

export const findDocuments = Effect.fn("Documents.find")(function* (
  principal: Principal,
  input: { query?: string; project?: { readonly id: string } | { readonly slug: string } },
) {
  const config = yield* AppConfig;
  const library = yield* readCachedLibrary(principal);
  const reference = input.project;
  const project = reference ? yield* findProject(principal, reference) : undefined;
  const available = library.documents.filter(
    (d) => !d.archived && (!project || d.projectId === project.id),
  );
  const documents = new Map(available.map((d) => [d.id, d]));
  const query = input.query?.trim();
  const matches = query
    ? (yield* SearchService.use((search) => search.search(library, query, project?.id))).flatMap(
        (match) => {
          const doc = documents.get(String(match.id));
          return doc ? [doc] : [];
        },
      )
    : [...available].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matches.slice(0, 20).map((d) => ({
    id: d.id,
    projectId: d.projectId,
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    revision: d.revision,
    url: `${config.origin}/documents/${d.id}`,
  }));
});
