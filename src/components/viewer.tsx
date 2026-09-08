"use client";
import { DocumentToolbar } from "./document-toolbar";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { startTransition, useEffect, useState } from "react";
import { formatDate } from "@/lib/date";
import { Check, Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import type { DocumentDetail } from "@/lib/model";
import { readReport } from "@/client/actions/library";
import { copyText, downloadHtml, toggleFullscreen, watchFullscreen } from "@/client/actions/files";
import { useTask } from "@/client/runtime";
import { ReportPreview } from "./report-preview";
import { CodeEditor } from "./code-editor";
import { Publisher } from "./publisher";
import { useWorkspace } from "./workspace";

export function Viewer({ initialReport }: { initialReport: DocumentDetail }) {
  const run = useTask();
  const { library, documentChanged, error: workspaceError } = useWorkspace();
  const id = initialReport.document.id;
  const [report, setReport] = useState(initialReport);
  const [version, setVersion] = useState<string>("");
  const [previousInitialReport, setPreviousInitialReport] = useState(initialReport);
  if (previousInitialReport !== initialReport) {
    setPreviousInitialReport(initialReport);
    if (!version && initialReport.document.updatedAt >= report.document.updatedAt)
      setReport(initialReport);
  }
  const [source, setSource] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const libraryDocument = library.documents.find((document) => document.id === id);
  const currentDocument =
    libraryDocument && libraryDocument.updatedAt >= report.document.updatedAt
      ? libraryDocument
      : report.document;
  const selectedVersion = version || String(currentDocument.revision);
  const loading = Number(selectedVersion) !== report.revision.version;
  useEffect(() => run(watchFullscreen(setExpanded)), [run]);
  useEffect(() => documentChanged(report.document), [documentChanged, report.document]);
  useEffect(() => {
    if (!loading) return;
    return run(readReport(id, selectedVersion), {
      onSuccess: (data) => {
        startTransition(() => {
          setReport(data);
          setError("");
        });
      },
      onError: (message) => {
        setError(message);
        setVersion(String(report.revision.version));
      },
    });
  }, [id, selectedVersion, loading, report.revision.version, run]);
  return (
    <main id="main" className="viewer-main">
      <DocumentToolbar
        document={currentDocument}
        project={report.project}
        author={report.revision.author}
        edit={loading ? undefined : () => setEdit(true)}
        view={{ source, onSourceChange: setSource }}
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
                    "Copy the address from your browser to share this private link.",
                  ),
                  {
                    onSuccess: () => setCopied(true),
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
              {expanded ? "Exit fullscreen" : "Expand report"}
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
      <Publisher
        key={`${report.document.id}:${report.revision.version}:${report.document.revision}`}
        open={edit}
        onOpenChange={setEdit}
        projects={[report.project]}
        initial={report}
        onPublished={(document) => {
          setVersion("");
          documentChanged(document);
        }}
      />
    </main>
  );
}
