"use client";
import { Form, FieldGroup } from "./ui/form";
import { useForm, useStore } from "@tanstack/react-form";
import { Field, FieldLabel, FieldError } from "./ui/field";
import { ViewModeControl } from "./ui/view-mode-control";
import { SelectField } from "./ui/select-field";
import { startTransition, useState, useTransition } from "react";
import { Result } from "effect";
import { Upload } from "lucide-react";
import type { Document, Project } from "@/lib/model";
import { slugify } from "@/lib/model";
import { publishReport } from "@/client/actions/library";
import { readHtmlFile } from "@/client/actions/files";
import { runAction, useTask } from "@/client/runtime";
import { ReportPreview } from "./report-preview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CodeEditor } from "./code-editor";

const starter = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Untitled report</title>
<style>
  :root { color-scheme: light dark; --background: oklch(0.997 0 0); --foreground: oklch(0.205 0 0); }
  @media (prefers-color-scheme: dark) {
    :root { --background: oklch(0.185 0 0); --foreground: oklch(0.94 0 0); }
  }
  body { max-width: 760px; margin: 64px auto; padding: 0 24px;
    font: 17px/1.7 system-ui; color: var(--foreground); background: var(--background); }
  h1 { font-size: 40px; line-height: 1.2; letter-spacing: -.04em; }
</style>
<h1>Untitled report</h1>
<p>Report content.</p>
</html>`;

export function Publisher({
  open,
  onOpenChange,
  projects,
  projectId,
  initial,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ReadonlyArray<Project>;
  projectId?: string;
  initial?: { document: Document; html: string };
  onPublished: (document: Document) => void;
}) {
  const run = useTask();
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, submit] = useTransition();
  const form = useForm({
    defaultValues: {
      title: initial?.document.title ?? "",
      project:
        projects.find((p) => p.id === (initial?.document.projectId || projectId))?.id ||
        projects[0]?.id ||
        "",
      slug: initial?.document.slug ?? "",
      summary: initial?.document.summary ?? "",
      kind: initial?.document.kind ?? "report",
      tags: initial?.document.tags.join(", ") ?? "",
      html: initial?.html ?? starter,
    },
    onSubmit: ({ value }) => {
      if (busy) return;
      setError("");
      submit(() =>
        runAction(
          publishReport({
            project: { id: value.project },
            slug: initial?.document.slug || value.slug || slugify(value.title),
            title: value.title,
            summary: value.summary,
            kind: value.kind,
            tags: value.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            html: value.html,
            expectedRevision: initial?.document.revision ?? 0,
          }),
        ).then((result) => {
          startTransition(() => {
            if (Result.isFailure(result)) {
              setError(result.failure);
              return;
            }
            onOpenChange(false);
            onPublished(result.success.document);
            if (!initial) {
              form.reset();
            }
            setPreview(false);
          });
        }),
      );
    },
  });
  const { html, title } = useStore(form.store, (state) => state.values);
  const setHTML = (value: string) => form.setFieldValue("html", value);
  function fileSelected(file?: File) {
    if (!file) return;
    run(readHtmlFile(file), {
      onSuccess: (content) => {
        setHTML(content.html);
        setError("");
        if (!title) form.setFieldValue("title", content.title);
      },
      onError: setError,
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent placement="right" size="editor" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{initial ? "Publish a revision" : "Publish a document"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Your previous revision will stay in the history."
              : "Upload a self-contained HTML file or paste its source."}
          </DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup columns={2}>
            <form.Field name="title">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="publisher-field-1">Title</FieldLabel>
                  <Input
                    id="publisher-field-1"
                    className="font-sans"
                    placeholder="What is this about?"
                    maxLength={160}
                    required

                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="project">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="publisher-select-1">Project</FieldLabel>
                  <SelectField
                    onBlur={field.handleBlur}
                    id="publisher-select-1"
                    label="Project"
                    name="project"
                    readOnly={!!initial}
                    options={projects
                      .filter((p) => !initial || p.id === initial.document.projectId)
                      .map((p) => ({ value: p.id, label: p.name }))}

                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="slug">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="publisher-field-3">Slug</FieldLabel>
                  <Input
                    id="publisher-field-3"
                    name="slug"
                    readOnly={!!initial}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={80}
                    required

                    value={field.state.value || slugify(title)}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="kind">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="publisher-select-2">Type</FieldLabel>
                  <SelectField
                    onBlur={field.handleBlur}
                    id="publisher-select-2"
                    label="Type"
                    name="kind"
                    options={[
                      { value: "report", label: "Report" },
                      { value: "plan", label: "Plan" },
                      { value: "reference", label: "Reference" },
                    ]}

                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value === "report" || value === "plan" || value === "reference")
                        field.handleChange(value);
                    }}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="summary">
              {(field) => (
                <Field className="span-two">
                  <FieldLabel htmlFor="publisher-field-5">Summary</FieldLabel>
                  <Input
                    id="publisher-field-5"
                    className="font-sans"
                    name="summary"
                    placeholder="A sentence to help you find it later"
                    maxLength={500}

                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="tags">
              {(field) => (
                <Field className="span-two">
                  <FieldLabel htmlFor="publisher-field-6">
                    Tags <span className="muted">Optional</span>
                  </FieldLabel>
                  <Input
                    id="publisher-field-6"
                    name="tags"
                    placeholder="architecture, research"

                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <div className="editor-toolbar">
            <ViewModeControl source={!preview} onSourceChange={(source) => setPreview(!source)} />
            <label className="upload-control">
              <Upload size={15} />
              <span>Choose HTML file</span>
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={(event) => fileSelected(event.target.files?.[0])}
              />
            </label>
          </div>
          <div className="publish-editor">
            {preview ? (
              <ReportPreview
                title="Report preview"
                html={html}
                onNavigate={() => onOpenChange(false)}
              />
            ) : (
              <CodeEditor value={html} onChange={setHTML} />
            )}
          </div>
          <div className="publish-footer">
            <p className="hint">Self-contained HTML. Network resources are restricted.</p>
            <Button type="submit" disabled={busy}>
              {busy ? "Publishing…" : initial ? "Publish revision" : "Publish document"}
            </Button>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
