"use client";

import { Suspense, use } from "react";
import type { Document, DocumentDetail, Project } from "@/lib/model";
import { DocumentHeading } from "./document-heading";
import { LoadingState } from "./ui/loading-state";
import { Viewer } from "./viewer";
import { useWorkspace } from "./workspace";

function PendingDocument({ document, project }: { document: Document; project: Project }) {
  const { library, error } = useWorkspace();
  const libraryDocument = library.documents.find((item) => item.id === document.id);
  const current =
    libraryDocument && libraryDocument.updatedAt >= document.updatedAt ? libraryDocument : document;
  return (
    <main id="main" className="viewer-main">
      <DocumentHeading document={current} project={project} />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="report-surface" aria-busy="true">
        <LoadingState>Loading HTML…</LoadingState>
      </div>
    </main>
  );
}

function ResolvedDocument({ report }: { report: Promise<DocumentDetail> }) {
  return <Viewer initialReport={use(report)} />;
}

export function DocumentStream({
  document,
  project,
  report,
}: {
  document: Document;
  project: Project;
  report: Promise<DocumentDetail>;
}) {
  return (
    <Suspense fallback={<PendingDocument document={document} project={project} />}>
      <ResolvedDocument report={report} />
    </Suspense>
  );
}
