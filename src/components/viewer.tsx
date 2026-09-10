"use client";
import { DocumentToolbar } from "./document-toolbar";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { startTransition, useEffect, useState } from "react";
import { formatDate } from "@/lib/date";
import { Check, Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import type { DocumentDetail } from "@/lib/model";
import { readReport, loadProjectLibrary } from "@/client/actions/library";
import { copyText, downloadHtml, toggleFullscreen, watchFullscreen } from "@/client/actions/files";
import { useTask } from "@/client/runtime";
import { ReportPreview } from "./report-preview";
import { CodeEditor } from "./code-editor";
import { Publisher } from "./publisher";
import { useWorkspace } from "./workspace";
import { Button } from "./ui/button";
import { LoadingState } from "./ui/loading-state";
import { capture } from "@/client/telemetry";

export function Viewer({ initialReport }: { initialReport: DocumentDetail }) {
  const run = useTask();
  const { library, documentChanged, setProjectScope, error: workspaceError } = useWorkspace();
  const id = initialReport.document.id;
  const [report, setReport] = useState<DocumentDetail | null>(initialReport);
  const [version, setVersion] = useState<string>("");
  const [previousInitialReport, setPreviousInitialReport] = useState(initialReport);
  if (previousInitialReport !== initialReport) {
    setPreviousInitialReport(initialReport);
    if (!version && (!report || initialReport.document.updatedAt >= report.document.updatedAt))
      setReport(initialReport);
  }
  const [source, setSource] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const libraryDocument = library.documents.find((document) => document.id === id);
  const libraryProject = library.projects.find(
    (project) => project.id === initialReport.document.projectId,
  );
  const [knownAccess, setKnownAccess] = useState({
    document: !!libraryDocument,
    project: !!libraryProject,
    revision: 0,
  });
  if (knownAccess.document !== !!libraryDocument || knownAccess.project !== !!libraryProject) {
    const lostGrant =
      (knownAccess.document && !libraryDocument) || (knownAccess.project && !libraryProject);
    setKnownAccess({
      document: !!libraryDocument,
      project: !!libraryProject,
      revision: knownAccess.revision + (lostGrant ? 1 : 0),
    });
    if (lostGrant) {
      // Remove the iframe, metadata, and edit draft before rechecking the remaining grant.
      setReport(null);
      setVersion("");
      setEdit(false);
      setError("");
    }
  }
  const loadedDocument = report?.document;
  const loadedVersion = report?.revision.version;
  useEffect(() => {
    if (loadedVersion === undefined) return;
    capture("document_viewed", { document_id: id, revision: loadedVersion });
  }, [id, loadedVersion]);
  const currentDocument =
    libraryDocument && loadedDocument && libraryDocument.updatedAt >= loadedDocument.updatedAt
      ? libraryDocument
      : loadedDocument;
  const selectedVersion = version || String(currentDocument?.revision ?? "");
  const canEdit =
    currentDocument?.accessRole === "edit" || currentDocument?.accessRole === "full_access";
  const currentProject = report?.project ? (libraryProject ?? report.project) : null;
  const missingProjectId =
    report?.project && !library.projects.some((project) => project.id === report.project?.id)
      ? report.project.id
      : undefined;
  const loading = loadedVersion !== undefined && Number(selectedVersion) !== loadedVersion;
  useEffect(() => run(watchFullscreen(setExpanded)), [run]);
  useEffect(() => {
    if (loadedDocument) documentChanged(loadedDocument);
  }, [documentChanged, loadedDocument]);
  useEffect(() => {
    if (!knownAccess.revision) return;
    return run(readReport(id), {
      onSuccess: (data) => {
        setReport(data);
        setError("");
      },
      onError: setError,
    });
  }, [knownAccess.revision, id, run]);
  useEffect(() => {
    if (!missingProjectId) return;
    return run(loadProjectLibrary(missingProjectId), {
      onSuccess: setProjectScope,
      onError: setError,
    });
  }, [missingProjectId, run, setProjectScope]);
  useEffect(() => {
    if (!loading || loadedVersion === undefined) return;
    return run(readReport(id, selectedVersion), {
      onSuccess: (data) => {
        startTransition(() => {
          setReport(data);
          setError("");
        });
      },
      onError: (message) => {
        setError(message);
        setVersion(String(loadedVersion));
      },
    });
  }, [id, selectedVersion, loading, loadedVersion, run]);
  if (!report || !currentDocument)
    return (
      <main id="main" className="viewer-main">
        {error ? (
          <div className="space-y-3 p-6">
            <p className="error-text" role="alert">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setKnownAccess((current) => ({ ...current, revision: current.revision + 1 }));
              }}
            >
              Check access again
            </Button>
          </div>
        ) : (
          <LoadingState>Checking document access…</LoadingState>
        )}
      </main>
    );
  return (
    <main id="main" className="viewer-main">
      <DocumentToolbar
        document={currentDocument}
        project={currentProject}
        author={report.revision.author}
        edit={loading || !canEdit ? undefined : () => setEdit(true)}
        view={{
          source,
          onSourceChange: (value) => {
            setSource(value);
            capture("document_view_changed", {
              document_id: id,
              mode: value ? "source" : "preview",
            });
          },
        }}
        loading={loading}
        revision={{
          value: selectedVersion,
          onValueChange: setVersion,
          options: [
            ...(!report.history.some((item) => item.version === currentDocument.revision)
              ? [
                  {
                    value: String(currentDocument.revision),
                    label: `v${currentDocument.revision} · Latest`,
                  },
                ]
              : []),
            ...report.history.map((item) => ({
              value: String(item.version),
              label: `v${item.version}${item.version === currentDocument.revision ? " · Latest" : ""} · ${formatDate(item.createdAt, { locale: "en", month: "short", day: "numeric" })}`,
            })),
          ],
        }}
        actions={
          <>
            <DropdownMenuItem
              onClick={() =>
                run(
                  copyText(
                    window.location.href,
                    "Unable to copy. Copy the private link from your browser's address bar.",
                  ),
                  {
                    onSuccess: () => {
                      setCopied(true);
                      capture("document_link_copied", { document_id: id });
                    },
                    onError: setError,
                  },
                )
              }
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Link copied" : "Copy private link"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={loading}
              onClick={() =>
                run(
                  downloadHtml(
                    report.html,
                    `${report.document.slug}-v${report.revision.version}.html`,
                  ),
                  { onError: setError },
                )
              }
            >
              <Download aria-hidden="true" /> Download HTML
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                run(toggleFullscreen, { onSuccess: () => setError(""), onError: setError })
              }
            >
              {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              {expanded ? "Exit fullscreen" : "Enter fullscreen"}
            </DropdownMenuItem>
          </>
        }
      />
      <output className="sr-only">{copied ? "Private link copied" : ""}</output>
      {(error || workspaceError) && (
        <p className="inline-error" role="alert">
          {error || workspaceError}
        </p>
      )}
      {currentDocument.archived && <div className="archive-notice">This document is archived.</div>}
      <div className="report-surface">
        <div className="report-content" aria-busy={loading}>
          {source ? (
            <CodeEditor value={report.html} readOnly />
          ) : (
            <ReportPreview title={report.document.title} html={report.html} />
          )}
        </div>
      </div>
      {canEdit && (
        <Publisher
          key={`${report.document.id}:${report.revision.version}:${report.document.revision}`}
          open={edit}
          onOpenChange={setEdit}
          projects={currentProject ? [currentProject] : []}
          initial={report}
          onPublished={(document) => {
            setVersion("");
            documentChanged(document);
          }}
        />
      )}
    </main>
  );
}
