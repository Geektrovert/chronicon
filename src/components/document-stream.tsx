"use client";

import { Suspense, use } from "react";
import type { Document, DocumentDetail, Project } from "@/lib/model";
import { DocumentToolbar } from "./document-toolbar";
import { LoadingState } from "./ui/loading-state";
import { Viewer } from "./viewer";
import { useWorkspace } from "./workspace";

type DocumentHeading = { document: Document; project: Project | null };

function PendingDocument({ heading }: { heading: Promise<DocumentHeading> }) {
  const { document, project } = use(heading);
  const { library, error } = useWorkspace();
  const libraryDocument = library.documents.find((item) => item.id === document.id);

  const current =
    libraryDocument && libraryDocument.updatedAt >= document.updatedAt ? libraryDocument : document;

  return (
    <main id="main" className="viewer-main">
      <DocumentToolbar document={current} project={project} />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="report-surface" aria-busy="true">
        <LoadingState>Loading document…</LoadingState>
      </div>
    </main>
  );
}

function ResolvedDocument({ report }: { report: Promise<DocumentDetail> }) {
  return <Viewer initialReport={use(report)} />;
}

export function DocumentStream({
  heading,
  report,
}: {
  heading: Promise<DocumentHeading>;
  report: Promise<DocumentDetail>;
}) {
  return (
    <Suspense fallback={<PendingDocument heading={heading} />}>
      <ResolvedDocument report={report} />
    </Suspense>
  );
}
