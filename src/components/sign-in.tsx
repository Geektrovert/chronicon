"use client";

import { Form } from "./ui/form";
import { useForm } from "@tanstack/react-form";
import { Field, FieldLabel, FieldError, FieldDescription } from "./ui/field";
import { useState } from "react";
import { PageHeader } from "./ui/page-header";
import { Brand } from "./brand";
import { ArrowRight } from "lucide-react";
import { signIn, signUp } from "@/client/actions/auth";
import { useTask } from "@/client/runtime";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignIn({ create = false, next = "/" }: { create?: boolean; next?: string }) {
  const title = create ? "Create account" : "Sign in";
  const busyTitle = create ? "Creating account…" : "Signing in…";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = useTask();

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: ({ value }) => {
      if (busy) return;
      setBusy(true);
      setError("");
      run((create ? signUp : signIn)(value), {
        onError: setError,
        onSettled: () => setBusy(false),
      });
    },
  });

  return (
    <main className="signin-page">
      <Brand />
      <div className="signin-form">
        <PageHeader title={title} />
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          {create && (
            <form.Field name="name">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="account-name">Name</FieldLabel>
                  <Input
                    id="account-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
          )}
          <form.Field name="email">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="sign-in-field-1">Email</FieldLabel>
                <Input
                  id="sign-in-field-1"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="sign-in-field-2">Password</FieldLabel>
                <Input
                  id="sign-in-field-2"
                  name="password"
                  type="password"
                  autoComplete={create ? "new-password" : "current-password"}
                  minLength={create ? 12 : undefined}
                  maxLength={128}
                  aria-describedby={create ? "password-hint" : undefined}
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {create && (
                  <FieldDescription id="password-hint">Use 12 to 128 characters.</FieldDescription>
                )}
              </Field>
            )}
          </form.Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? busyTitle : title}
            <ArrowRight size={16} />
          </Button>
        </Form>
        <ButtonLink
          variant="link"
          className="w-full"
          href={`${create ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(next)}`}
        >
          {create ? "Sign in to an existing account" : "Create account"}
        </ButtonLink>
      </div>
    </main>
  );
}
