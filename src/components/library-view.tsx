"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Document } from "@/lib/model";
import { DocumentList } from "./document-list";
import { useWorkspace } from "./workspace";
import { Button } from "./ui/button";
import { Toolbar } from "./ui/toolbar";
import { SearchField } from "./ui/search-field";
import { SelectField } from "./ui/select-field";
import { PageHeader } from "./ui/page-header";

export function LibraryView({
  section = "all",
  projectId,
}: {
  section?: "all" | "starred" | "archived";
  projectId?: string;
}) {
  const {
    library,
    query,
    setQuery,
    search,
    error,
    refresh,
    publish,
    updateDocument,
    pendingDocuments,
    refreshing,
  } = useWorkspace();

  const searchInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("updated");
  const project = library.projects.find((project) => project.id === projectId);

  const readOnly =
    !!project && project.accessRole !== "edit" && project.accessRole !== "full_access";

  const canPublish = library.projects.some(
    (item) => item.accessRole === "edit" || item.accessRole === "full_access",
  );

  const documentsById = new Map(library.documents.map((document) => [document.id, document]));

  const visible = (
    query.trim()
      ? search.ids
          .map((id) => documentsById.get(id))
          .filter((document): document is Document => !!document)
      : library.documents
  ).filter(
    (document) =>
      (!projectId || document.projectId === projectId) &&
      (section === "archived" ? document.archived : !document.archived) &&
      (section !== "starred" || document.starred) &&
      (kind === "all" || document.kind === kind),
  );

  if (!query.trim())
    visible.sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt),
    );

  function toggleStar(document: Document) {
    updateDocument(document, { starred: !document.starred });
  }

  return (
    <main id="main" className="library-main">
      <PageHeader
        title={
          project
            ? "Documents"
            : section === "starred"
              ? "Starred documents"
              : section === "archived"
                ? "Archive"
                : "All documents"
        }
        description={project?.description}
      />
      <Toolbar className="library-toolbar">
        <div className="search-field">
          <SearchField
            inputRef={searchInput}
            id="library-search"
            label={project ? `Search documents in ${project.name}` : "Search documents"}
            placeholder={project ? "Search this project…" : "Search documents…"}
            value={query}
            onValueChange={setQuery}
          />
        </div>
        <div className="filter-controls">
          <label htmlFor="document-type" className="filter-control">
            <span className="sr-only">Document type</span>
            <SelectField
              id="document-type"
              label="Document type"
              value={kind}
              onValueChange={setKind}
              options={[
                { value: "all", label: "All types" },
                { value: "report", label: "Reports" },
                { value: "plan", label: "Plans" },
                { value: "reference", label: "References" },
              ]}
            />
          </label>
          <label htmlFor="document-sort" className="filter-control">
            <span className="sr-only">Sort documents</span>
            <SelectField
              id="document-sort"
              label="Sort documents"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: "updated", label: "Last updated" },
                { value: "title", label: "Title" },
              ]}
            />
          </label>
        </div>
        {!readOnly && (
          <Button onClick={publish}>
            <Plus size={16} />
            {canPublish ? "Publish document" : "Create project"}
          </Button>
        )}
      </Toolbar>
      {(error || search.error) && (
        <div className="inline-error" role="alert">
          {error || search.error}
          <Button variant="ghost" onClick={error ? refresh : search.retry}>
            {error ? "Refresh documents" : "Retry search"}
          </Button>
        </div>
      )}
      <div className="list-caption">
        <output>
          {query.trim()
            ? `${visible.length} ${visible.length === 1 ? "document" : "documents"} matching "${query.trim()}"`
            : `${visible.length} ${visible.length === 1 ? "document" : "documents"}`}
        </output>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <DocumentList
        documents={visible}
        projects={library.projects}
        query={query}
        section={section}
        filtered={kind !== "all"}
        readOnly={readOnly}
        clearFilters={() => {
          setQuery("");
          setKind("all");
          searchInput.current?.focus();
        }}
        toggleStar={toggleStar}
        pendingDocuments={pendingDocuments}
      />
    </main>
  );
}
