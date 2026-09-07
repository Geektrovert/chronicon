"use client";

import { Archive, Pencil, RotateCcw, Star } from "lucide-react";
import type { Document, Project } from "@/lib/model";
import { Breadcrumb } from "./ui/breadcrumb";
import { Button } from "./ui/button";
import { Toolbar } from "./ui/toolbar";
import { useWorkspace } from "./workspace";

export function DocumentHeading({
  document,
  project,
  author,
  edit,
}: {
  document: Document;
  project: Project;
  author?: string;
  edit?: () => void;
}) {
  const { updateDocument, pendingDocuments } = useWorkspace();
  const pending = pendingDocuments.includes(document.id);
  return (
    <Toolbar className="viewer-heading">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Breadcrumb
          parent={{ href: `/projects/${project.slug}`, label: project.name }}
          title={document.title}
        />
        {author && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              .
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="sr-only">Published by </span>
              {author}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" disabled={!edit || pending} onClick={edit}>
          <Pencil size={15} />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Star document"
          aria-pressed={document.starred}
          disabled={pending}
          onClick={() => updateDocument(document, { starred: !document.starred })}
        >
          <Star size={16} fill={document.starred ? "currentColor" : "none"} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label={document.archived ? "Restore document" : "Archive document"}
          onClick={() => updateDocument(document, { archived: !document.archived })}
        >
          {document.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
        </Button>
      </div>
    </Toolbar>
  );
}
