import { EmptyState } from "./ui/empty-state";
import { NavigationLink } from "./ui/navigation-link";
import { formatDate } from "@/lib/date";
import { BookOpen, FileText, Layers2, Star } from "lucide-react";
import type { Document, Project } from "@/lib/model";
import { Button } from "./ui/button";

export function DocumentList({
  documents,
  projects,
  query,
  section,
  filtered,
  readOnly,
  clearFilters,
  toggleStar,
  pendingDocuments,
}: {
  documents: Document[];
  projects: ReadonlyArray<Project>;
  query: string;
  section: string;
  filtered: boolean;
  readOnly: boolean;
  clearFilters: () => void;
  toggleStar: (document: Document) => void;
  pendingDocuments: ReadonlyArray<string>;
}) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const pendingIds = new Set(pendingDocuments);

  if (!documents.length)
    return (
      <EmptyState
        icon={<FileText size={24} />}
        title={
          query.trim()
            ? `No documents match "${query.trim()}"`
            : filtered
              ? "No documents match these filters"
              : section === "starred"
                ? "No starred documents"
                : section === "archived"
                  ? "No archived documents"
                  : "No documents yet"
        }
        description={
          query || filtered
            ? "Try a different phrase or clear your filters."
            : section === "starred"
              ? "Star a document to find it here."
              : section === "archived"
                ? "Archive a document to remove it from your main list and keep it here."
                : readOnly
                  ? "Ask someone with edit access to publish a document in this project."
                  : projects.some(
                        (project) =>
                          project.accessRole === "edit" || project.accessRole === "full_access",
                      )
                    ? "Choose Publish document to add an HTML file."
                    : "Choose Create project to add your own documents."
        }
      >
        {(query || filtered) && (
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </EmptyState>
    );

  return (
    <div className="document-list">
      {documents.map((doc) => (
        <article key={doc.id} className="document-row">
          <span className={`document-icon kind-${doc.kind}`}>
            {doc.kind === "reference" ? (
              <BookOpen size={20} />
            ) : doc.kind === "plan" ? (
              <Layers2 size={20} />
            ) : (
              <FileText size={20} />
            )}
          </span>
          <NavigationLink className="document-row-link" href={`/documents/${doc.id}`}>
            <h2 className="content-title">{doc.title}</h2>
            <p className={doc.summary ? "content-description" : "font-mono"}>
              {doc.summary || `${doc.slug}.html`}
            </p>
            <div className="document-meta">
              <span>{projectsById.get(doc.projectId)?.name ?? "Shared document"}</span>
              <span className="meta-dot">·</span>
              <span>{doc.kind}</span>
              {doc.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </NavigationLink>
          <div className="document-row-end">
            <Button
              variant="ghost"
              size="icon-sm"
              className={`star-button ${doc.starred ? "is-starred" : ""}`}
              aria-label={doc.starred ? `Unstar ${doc.title}` : `Star ${doc.title}`}
              aria-pressed={doc.starred}
              disabled={pendingIds.has(doc.id)}
              onClick={() => toggleStar(doc)}
            >
              <Star size={16} fill={doc.starred ? "currentColor" : "none"} />
            </Button>
            <time dateTime={doc.updatedAt}>
              {formatDate(doc.updatedAt, { locale: "en", month: "short", day: "numeric" })}
            </time>
            <span className="revision-label">v{doc.revision}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
