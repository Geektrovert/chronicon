"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { useTheme } from "next-themes";
import { Effect, Random, Result } from "effect";
import {
  Download,
  Shuffle,
  RotateCcw,
  Sun,
  Moon,
  Columns2,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import type { Project } from "@/lib/model";
import {
  BASE_COLORS,
  ACCENT_COLORS,
  STYLE_NAMES,
  FONT_NAMES,
  ICON_LIBRARIES,
  type ProjectDesign,
} from "@/lib/project-design/model";
import { buildTokens, SOURCE_URL } from "@/lib/project-design/config";
import { designCSS } from "@/lib/project-design/markdown";
import { loadProjectDesign, saveProjectDesign } from "@/client/actions/project-design";
import { runAction } from "@/client/runtime";
import { Button, ButtonLink } from "../ui/button";
import { Field, FieldDescription, FieldLabel } from "../ui/field";
import { Form } from "../ui/form";
import { Textarea } from "../ui/textarea";
import { DesignCustomizer } from "./customizer";
import { DesignPreview, type PreviewMode } from "./preview";
import { designChanged, useDesignDrafts } from "./drafts";
import "./studio.css";

function randomItem<T>(items: readonly T[]) {
  return items[Effect.runSync(Random.nextIntBetween(0, items.length))];
}
function AppearanceControl({
  mode,
  onChange,
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  return (
    <fieldset aria-label="Preview appearance" className="design-mode-controls">
      {(
        [
          { value: "light", label: "Light preview", Icon: Sun },
          { value: "dark", label: "Dark preview", Icon: Moon },
          { value: "both", label: "Compare light and dark", Icon: Columns2 },
        ] as const
      ).map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={mode === value ? "outline" : "ghost"}
          size="icon-sm"
          aria-label={label}
          title={label}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
        >
          <Icon />
        </Button>
      ))}
    </fieldset>
  );
}
export function ProjectDesignEditor({
  project,
  initial,
}: {
  project: Project;
  initial: ProjectDesign;
}) {
  const { resolvedTheme } = useTheme();
  const drafts = useDesignDrafts();
  const [restoredDraft, setRestoredDraft] = useState(() => drafts.get(project.id));
  const [saved, setSaved] = useState(restoredDraft?.base ?? initial);
  const baseline = useRef(saved);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(restoredDraft ? "Restored your unsaved design." : "");
  const [busy, start] = useTransition();
  const [operation, setOperation] = useState<"save" | "reload">("save");
  const [mode, setMode] = useState<PreviewMode | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const customizeButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const previousControlsOpen = useRef(controlsOpen);
  useEffect(() => {
    if (previousControlsOpen.current === controlsOpen) return;
    previousControlsOpen.current = controlsOpen;
    (controlsOpen ? doneButton : customizeButton).current?.focus();
  }, [controlsOpen]);
  const previewMode = mode ?? (resolvedTheme === "dark" ? "dark" : "light");
  const form = useForm({
    defaultValues: restoredDraft?.values ?? { settings: saved.settings, guidance: saved.guidance },
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
          baseline.current = result.success;
          drafts.delete(project.id);
          setRestoredDraft(undefined);
          setSaved(result.success);
          form.reset({ settings: result.success.settings, guidance: result.success.guidance });
          setMessage(`Saved revision ${result.success.revision}.`);
        }),
      );
    },
  });
  useEffect(() => {
    const rememberDraft = () => {
      const values = form.store.state.values;
      if (designChanged(values, baseline.current)) {
        drafts.set(project.id, { base: baseline.current, values });
      } else {
        drafts.delete(project.id);
      }
    };
    rememberDraft();
    const subscription = form.store.subscribe(rememberDraft);
    return () => subscription.unsubscribe();
  }, [drafts, form, project.id]);
  function reload() {
    setOperation("reload");
    setError("");
    setMessage("");
    start(() =>
      runAction(loadProjectDesign(project.id)).then((result) => {
        if (Result.isFailure(result)) {
          setError(result.failure);
          return;
        }
        baseline.current = result.success;
        drafts.delete(project.id);
        setRestoredDraft(undefined);
        setSaved(result.success);
        form.reset({ settings: result.success.settings, guidance: result.success.guidance });
        setMessage("Loaded saved design.");
      }),
    );
  }
  return (
    <main id="main" className="design-studio">
      <Form
        id="design-studio-form"
        className="design-studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <header className="design-studio-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-col">
              <h1 className="text-sm font-semibold">Design system</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AppearanceControl mode={previewMode} onChange={setMode} />
            <Button
              type="button"
              variant={showGuidance ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showGuidance}
              onClick={() => setShowGuidance(!showGuidance)}
            >
              <FileText />
              <span className="hidden sm:inline">design.md</span>
              <span className="sr-only sm:hidden">Project guidance</span>
            </Button>
            <form.Subscribe selector={(state) => designChanged(state.values, saved)}>
              {(dirty) => (
                <Button type="submit" size="sm" disabled={busy || (!dirty && saved.revision > 0)}>
                  {busy && operation === "save" ? "Saving…" : "Save design"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </header>
        <div className="design-studio-body" data-controls-open={controlsOpen}>
          <aside className="design-controls" aria-label="Design system controls">
            <div className="design-controls-heading">
              <span className="text-sm font-medium">Customize</span>
              <span className="text-xs text-muted-foreground">Base UI</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="design-close-controls"
                ref={doneButton}
                onClick={() => setControlsOpen(false)}
              >
                Done
              </Button>
            </div>
            <div className="design-controls-scroll">
              <form.Field name="settings">
                {(field) => (
                  <DesignCustomizer
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={busy}
                  />
                )}
              </form.Field>
            </div>
            <div className="design-controls-footer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const baseColor = randomItem(BASE_COLORS);
                  const theme = randomItem([baseColor, ...ACCENT_COLORS]);
                  form.setFieldValue("settings", {
                    ...form.getFieldValue("settings"),
                    style: randomItem(STYLE_NAMES),
                    baseColor,
                    theme,
                    chartColor: theme,
                    font: randomItem(FONT_NAMES),
                    fontHeading: "inherit",
                    iconLibrary: randomItem(ICON_LIBRARIES),
                  });
                  setMessage("");
                }}
              >
                <Shuffle />
                Shuffle
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reload}>
                <RotateCcw />
                {busy && operation === "reload" ? "Loading…" : "Reload saved"}
              </Button>
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-center text-xs text-muted-foreground underline underline-offset-4"
              >
                shadcn/ui · MIT
              </a>
            </div>
          </aside>
          <div className="design-stage">
            <div className="design-stage-toolbar">
              <div className="design-mobile-appearance">
                <AppearanceControl mode={previewMode} onChange={setMode} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="design-open-controls"
                ref={customizeButton}
                aria-expanded={controlsOpen}
                onClick={() => setControlsOpen(!controlsOpen)}
              >
                <SlidersHorizontal />
                Customize
              </Button>
              <span className="design-stage-caption text-xs text-muted-foreground">
                {showGuidance
                  ? "Project guidance and theme tokens"
                  : "Component previews · sample content"}
              </span>
              <form.Subscribe selector={(state) => designChanged(state.values, saved)}>
                {(dirty) => (
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                    {dirty
                      ? "Unsaved changes"
                      : saved.revision
                        ? `Revision ${saved.revision}`
                        : "Default design"}
                  </span>
                )}
              </form.Subscribe>
            </div>
            {error && (
              <div className="design-status text-destructive" role="alert">
                {error} Your draft is preserved. Reload saved to discard it.
              </div>
            )}
            {message && (
              <output className="design-status text-muted-foreground" aria-live="polite">
                {message}
              </output>
            )}
            <form.Field name="settings">
              {(field) => {
                const unchanged = Object.entries(field.state.value).every(
                  ([key, value]) => Reflect.get(saved.settings, key) === value,
                );
                const tokens = unchanged ? saved.tokens : buildTokens(field.state.value);
                return showGuidance ? (
                  <section className="design-guidance-panel" aria-label="Project design document">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">design.md</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Shared design decisions for people and agents.
                        </p>
                      </div>
                      <ButtonLink
                        variant="outline"
                        size="sm"
                        href={`/api/projects/${project.id}/design.md`}
                        download="design.md"
                        prefetch={false}
                      >
                        <Download />
                        Download saved
                      </ButtonLink>
                    </div>
                    <form.Field name="guidance">
                      {(guidance) => (
                        <Field>
                          <FieldLabel htmlFor="design-guidance">Project guidance</FieldLabel>
                          <FieldDescription id="design-guidance-help">
                            Markdown notes for layout, writing, accessibility, and project
                            conventions.
                          </FieldDescription>
                          <Textarea
                            id="design-guidance"
                            aria-describedby="design-guidance-help"
                            rows={12}
                            maxLength={64000}
                            value={guidance.state.value}
                            onBlur={guidance.handleBlur}
                            onChange={(event) => guidance.handleChange(event.target.value)}
                            disabled={busy}
                            className="font-mono text-sm"
                          />
                        </Field>
                      )}
                    </form.Field>
                    <details className="mt-8">
                      <summary className="cursor-pointer text-sm font-medium">Theme CSS</summary>
                      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
                        <code>{designCSS(tokens)}</code>
                      </pre>
                    </details>
                  </section>
                ) : (
                  <DesignPreview tokens={tokens} settings={field.state.value} mode={previewMode} />
                );
              }}
            </form.Field>
          </div>
        </div>
      </Form>
    </main>
  );
}
