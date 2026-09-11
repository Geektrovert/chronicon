import MiniSearch from "minisearch";
import type { Library } from "./model";

export function buildSearch(library: Library) {
  const index = new MiniSearch({
    fields: ["title", "project", "tags", "summary", "text"],
    storeFields: ["projectId", "archived"],
    searchOptions: {
      boost: { title: 6, project: 3, tags: 3, summary: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      combineWith: "AND",
    },
  });

  const projects = new Map(library.projects.map((project) => [project.id, project.name]));
  index.addAll(
    library.documents.map((document) => ({
      ...document,
      project: projects.get(document.projectId) || "",
      tags: document.tags.join(" "),
    })),
  );

  return index;
}
