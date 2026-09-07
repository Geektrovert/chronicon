"use client";
import { ViewModeControl } from "./ui/view-mode-control";
import { DocumentHeading } from "./document-heading";
import { Toolbar } from "./ui/toolbar";
import { SelectField } from "./ui/select-field";
import { startTransition, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/date";
import { Check, Copy, Download, Maximize2 } from "lucide-react";
import type { DocumentDetail } from "@/lib/model";
import { readReport } from "@/client/actions/library";
import { copyText, downloadHtml, fullscreen } from "@/client/actions/files";
import { useTask } from "@/client/runtime";
import { previewHTML } from "@/lib/preview";
import { Button } from "./ui/button";
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
  const libraryDocument = library.documents.find((document) => document.id === id);
  const currentDocument =
    libraryDocument && libraryDocument.updatedAt >= report.document.updatedAt
      ? libraryDocument
      : report.document;
  const selectedVersion = version || String(currentDocument.revision);
  const loading = Number(selectedVersion) !== report.revision.version;
  const frame = useRef<HTMLDivElement>(null);
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
      <DocumentHeading
        document={currentDocument}
        project={report.project}
        author={report.revision.author}
        edit={loading ? undefined : () => setEdit(true)}
      />
      {(error || workspaceError) && (
        <p className="inline-error" role="alert">
          {error || workspaceError}
        </p>
      )}
      {currentDocument.archived && <div className="archive-notice">This document is archived.</div>}
      <div className="report-surface" ref={frame}>
        <Toolbar className="viewer-toolbar">
          <ViewModeControl source={source} onSourceChange={setSource} />
          <div className="viewer-tools">
            <label htmlFor="viewer-select-1" className="revision-select">
              <span className="sr-only">Choose revision</span>
              <SelectField
                id="viewer-select-1"
                label="Choose revision"
                value={selectedVersion}
                disabled={loading}
                onValueChange={(value) => {
                  setVersion(value);
                }}
                options={[
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
                ]}
              />
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copied ? "Link copied" : "Copy private link"}
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
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download HTML"
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
              <Download size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Expand report"
              onClick={() => {
                if (frame.current) run(fullscreen(frame.current), { onError: setError });
              }}
            >
              <Maximize2 size={16} />
            </Button>
          </div>
        </Toolbar>
        <div className="report-content" aria-busy={loading}>
          {source ? (
            <CodeEditor value={report.html} readOnly />
          ) : (
            <iframe
              title={report.document.title}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={previewHTML(report.html)}
            />
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
