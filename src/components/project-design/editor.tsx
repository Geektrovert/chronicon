"use client";
import { useState, useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { Result } from "effect";
import { Download } from "lucide-react";
import type { Project } from "@/lib/model";
import type { ProjectDesign } from "@/lib/project-design/model";
import { buildTokens, SOURCE_URL } from "@/lib/project-design/config";
import { loadProjectDesign, saveProjectDesign } from "@/client/actions/project-design";
import { runAction } from "@/client/runtime";
import { Button, ButtonLink } from "../ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Form } from "../ui/form";
import { PageHeader } from "../ui/page-header";
import { Textarea } from "../ui/textarea";
import { DesignCustomizer } from "./customizer";
import { DesignPreview } from "./preview";

export function ProjectDesignEditor({
  project,
  initial,
}: {
  project: Project;
  initial: ProjectDesign;
}) {
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const [operation, setOperation] = useState<"save" | "reload">("save");
  const form = useForm({
    defaultValues: { settings: saved.settings, guidance: saved.guidance },
    onSubmit: ({ value }) => {
      if (busy) return;
      setOperation("save");
      setError("");
      setMessage("");
      start(() =>
        runAction(
          saveProjectDesign(project.id, { ...value, expectedRevision: saved.revision }),
        ).then((result) => {
          if (Result.isFailure(result)) {
            setError(result.failure);
            return;
          }
          setSaved(result.success);
          form.reset({ settings: result.success.settings, guidance: result.success.guidance });
          setMessage(`Saved revision ${result.success.revision}.`);
        }),
      );
    },
  });
  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
      <nav className="mb-6" aria-label="Project">
        <ButtonLink href={`/projects/${project.slug}`} variant="link" className="px-0">
          {project.name} / Documents
        </ButtonLink>
      </nav>
      <PageHeader
        title="Design system"
        context={project.name}
        description="Shape the project’s colors, typography, and component defaults. Keep guidance for your agents in design.md."
        actions={
          <ButtonLink
            variant="outline"
            href={`/api/projects/${project.id}/design.md`}
            download="design.md"
            prefetch={false}
          >
            <Download />
            design.md
          </ButtonLink>
        }
      />
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="settings">
          {(field) => {
            const unchanged = Object.entries(field.state.value).every(
              ([key, value]) => Reflect.get(saved.settings, key) === value,
            );
            return (
              <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <section aria-label="Theme settings" className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Customize</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Nova · Base UI · Lucide</p>
                  </div>
                  <DesignCustomizer
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={busy}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Based on{" "}
                    <a
                      href={SOURCE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      shadcn/ui
                    </a>
                    , MIT licensed.
                  </p>
                </section>
                <DesignPreview tokens={unchanged ? saved.tokens : buildTokens(field.state.value)} />
              </div>
            );
          }}
        </form.Field>
        <form.Field name="guidance">
          {(field) => (
            <Field className="mt-5">
              <FieldLabel htmlFor="design-guidance">Project guidance</FieldLabel>
              <FieldDescription id="design-guidance-help">
                Markdown notes for agents: layout, writing, accessibility, and project conventions.
                Saved alongside the generated theme in design.md.
              </FieldDescription>
              <Textarea
                id="design-guidance"
                aria-describedby="design-guidance-help"
                rows={9}
                maxLength={64_000}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                disabled={busy}
                className="font-mono text-sm"
              />
            </Field>
          )}
        </form.Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <form.Subscribe selector={(state) => state.isDirty}>
            {(dirty) => (
              <>
                <Button type="submit" disabled={busy || (!dirty && saved.revision > 0)}>
                  {busy && operation === "save" ? "Saving…" : "Save design system"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setOperation("reload");
                    setError("");
                    setMessage("");
                    start(() =>
                      runAction(loadProjectDesign(project.id)).then((result) => {
                        if (Result.isFailure(result)) {
                          setError(result.failure);
                          return;
                        }
                        setSaved(result.success);
                        form.reset({
                          settings: result.success.settings,
                          guidance: result.success.guidance,
                        });
                        setMessage("Loaded saved design.");
                      }),
                    );
                  }}
                >
                  {busy && operation === "reload"
                    ? "Loading…"
                    : dirty
                      ? "Discard draft and reload"
                      : "Reload saved"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {dirty
                    ? "Unsaved changes"
                    : saved.revision
                      ? `Revision ${saved.revision}`
                      : "Default design"}
                </span>
              </>
            )}
          </form.Subscribe>
          <output className="text-sm text-muted-foreground" aria-live="polite">
            {message}
          </output>
        </div>
      </Form>
    </main>
  );
}
