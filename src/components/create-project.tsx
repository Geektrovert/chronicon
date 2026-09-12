"use client";

import { Form } from "./ui/form";
import { useForm, useStore } from "@tanstack/react-form";
import { Field, FieldLabel, FieldError, FieldDescription } from "./ui/field";
import { startTransition, useEffect, useState, useTransition } from "react";
import { Result } from "effect";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { slugify, type Project } from "@/lib/model";
import { createProject } from "@/client/actions/library";
import { runAction } from "@/client/runtime";
import { capture } from "@/client/telemetry";

export function CreateProject({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
}) {
  const [error, setError] = useState("");
  const [busy, submit] = useTransition();
  useEffect(() => {
    if (open) capture("project_create_opened");
  }, [open]);

  const form = useForm({
    defaultValues: { name: "", slug: "", description: "" },
    onSubmit: ({ value }) => {
      if (busy) return;
      setError("");
      submit(() =>
        runAction(
          createProject({
            name: value.name,
            slug: value.slug || slugify(value.name),
            description: value.description,
          }),
        ).then((result) => {
          startTransition(() => {
            if (Result.isFailure(result)) {
              setError(result.failure);

              return;
            }

            onCreated(result.success);
            onOpenChange(false);
            form.reset();
          });
        }),
      );
    },
  });

  const name = useStore(form.store, (state) => state.values.name);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription className="sr-only">
            Keep related documents and their design system together.
          </DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="create-project-field-1">Name</FieldLabel>
                <Input
                  id="create-project-field-1"
                  placeholder="Website redesign"
                  required
                  maxLength={100}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="slug">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="create-project-field-2">Short name</FieldLabel>
                <Input
                  id="create-project-field-2"
                  name="slug"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={80}
                  aria-describedby="project-slug-hint"
                  value={field.state.value || slugify(name)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldDescription id="project-slug-hint">
                  Used in links and agent commands. Use lowercase words or numbers separated by
                  hyphens.
                </FieldDescription>
              </Field>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="create-project-field-3">
                  Description <span className="muted">Optional</span>
                </FieldLabel>
                <Textarea
                  id="create-project-field-3"
                  name="description"
                  placeholder="Plans and references for the website redesign"
                  maxLength={400}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
