"use client";

import { useId, useState, useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { Result } from "effect";
import { savePublicProfile } from "@/client/actions/profile";
import { runAction } from "@/client/runtime";
import type { publicProfileSchema } from "@/lib/model";
import { Button, ButtonLink } from "./ui/button";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Form } from "./ui/form";
import { Input } from "./ui/input";

export function AccountSettings({
  initialProfile,
  emailVerified,
}: {
  initialProfile: typeof publicProfileSchema.Type;
  emailVerified: boolean;
}) {
  const fieldId = useId();
  const [profile, setProfile] = useState(initialProfile);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, submit] = useTransition();
  const form = useForm({
    defaultValues: { username: initialProfile.username },
    onSubmit: ({ value }) => {
      if (busy || !emailVerified) return;
      setError("");
      setNotice("");
      submit(() =>
        runAction(savePublicProfile({ ...value, expectedRevision: profile.revision })).then(
          (result) => {
            if (Result.isFailure(result)) {
              setError(result.failure);
              return;
            }
            setProfile(result.success);
            form.reset({ username: result.success.username });
            setNotice("Username saved. Existing public links still work.");
          },
        ),
      );
    },
  });
  return (
    <div className="space-y-8">
      <header>
        <h2 className="content-title text-xl">Public username</h2>
        <p className="content-description mt-2 text-sm text-muted-foreground">
          Your username appears in public document links. Changing it keeps existing links working.
        </p>
      </header>
      {!emailVerified && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">Verify your email before choosing a public username.</p>
          <ButtonLink href="/settings/team" variant="outline">
            Email verification
          </ButtonLink>
        </div>
      )}
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="username">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={fieldId}>Username</FieldLabel>
              <Input
                id={fieldId}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={3}
                maxLength={40}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                disabled={busy || !emailVerified}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value.toLowerCase())}
                onBlur={field.handleBlur}
                aria-describedby={`${fieldId}-description`}
              />
              <FieldDescription id={`${fieldId}-description`}>
                Use 3–40 lowercase letters, numbers, or hyphens.
              </FieldDescription>
              <p className="break-all text-xs text-muted-foreground">
                /{field.state.value || "username"}/d/document-slug-a1b2
              </p>
            </Field>
          )}
        </form.Field>
        <Button type="submit" className="self-start" disabled={busy || !emailVerified}>
          {busy ? "Saving…" : "Save username"}
        </Button>
      </Form>
      {error && (
        <p role="alert" className="error-text text-sm">
          {error}
        </p>
      )}
      {notice && <output className="block text-sm text-muted-foreground">{notice}</output>}
    </div>
  );
}
