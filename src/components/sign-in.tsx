"use client";
import { Form } from "./ui/form";
import { useForm } from "@tanstack/react-form";
import { Field, FieldLabel, FieldError } from "./ui/field";
import { useState } from "react";
import { PageHeader } from "./ui/page-header";
import { Brand } from "./brand";
import { ArrowRight } from "lucide-react";
import { signIn } from "@/client/actions/auth";
import { useTask } from "@/client/runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignIn() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = useTask();
  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: ({ value }) => {
      if (busy) return;
      setBusy(true);
      setError("");
      run(signIn({ email: value.email, password: value.password }), {
        onError: setError,
        onSettled: () => setBusy(false),
      });
    },
  });
  return (
    <main className="signin-page">
      <Brand />
      <div className="signin-form">
        <PageHeader title="Sign in" />
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
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
                  autoComplete="current-password"
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={16} />
          </Button>
        </Form>
      </div>
    </main>
  );
}
