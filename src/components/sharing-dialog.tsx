"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { Result } from "effect";
import { Share2 } from "lucide-react";
import { loadSharing, changeSharing, type ResourceType } from "@/client/actions/sharing";
import { runAction, useTask } from "@/client/runtime";
import { capture } from "@/client/telemetry";
import type { AccessRole, Sharing } from "@/lib/sharing";
import { Button, ButtonLink } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Form } from "./ui/form";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select-field";
import { useWorkspace } from "./workspace";
import { SharingAccess } from "./sharing-access";
import { sharingRoleOptions, isSharingRole } from "./sharing-permissions";

export function SharingButton({
  type,
  id,
  name,
}: {
  type: ResourceType;
  id: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" aria-label={`Share ${type}`} onClick={() => setOpen(true)}>
        <Share2 aria-hidden="true" />
        <span className="sharing-label">{type === "project" ? "Share project" : "Share"}</span>
      </Button>
      <SharingDialog
        key={`${type}:${id}`}
        type={type}
        id={id}
        name={name}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function SharingDialog({
  type,
  id,
  name,
  open,
  onOpenChange,
}: {
  type: ResourceType;
  id: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useTask();
  const { refresh } = useWorkspace();
  const fieldId = useId();
  const [data, setData] = useState<Sharing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, submit] = useTransition();
  useEffect(() => {
    if (!open) return;
    capture("sharing_opened", { resource_type: type });
    return run(loadSharing(type, id), { onSuccess: setData, onError: setError });
  }, [open, type, id, run]);

  function change(input: Parameters<typeof changeSharing>[2], message: string) {
    if (busy) return;
    setError("");
    setNotice("");
    submit(() =>
      runAction(changeSharing(type, id, input)).then((result) => {
        if (Result.isFailure(result)) {
          setError(result.failure);
          return;
        }
        setData(result.success);
        setNotice(message);
        refresh();
        if (input.action === "invite") form.reset();
      }),
    );
  }

  const form = useForm({
    defaultValues: { email: "", role: "view" as AccessRole },
    onSubmit: ({ value }) => change({ action: "invite", ...value }, "Access updated."),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent size="wide" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Share {type}</DialogTitle>
          <DialogDescription className="break-words">{name}</DialogDescription>
        </DialogHeader>
        {!data && !error && <p className="text-muted-foreground">Loading access…</p>}
        {data && (
          <>
            {data.canManage ? (
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  void form.handleSubmit();
                }}
              >
                <div className="flex flex-wrap items-end gap-2">
                  <form.Field name="email">
                    {(field) => (
                      <Field className="min-w-44 flex-1">
                        <FieldLabel htmlFor={`${fieldId}-email`}>Invite by email</FieldLabel>
                        <Input
                          id={`${fieldId}-email`}
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          required
                          maxLength={254}
                          disabled={busy}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="role">
                    {(field) => (
                      <Field className="w-36">
                        <FieldLabel htmlFor={`${fieldId}-role`}>Permission</FieldLabel>
                        <SelectField
                          id={`${fieldId}-role`}
                          label="Invitation permission"
                          options={sharingRoleOptions}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          disabled={busy}
                          onValueChange={(value) =>
                            isSharingRole(value) && field.handleChange(value)
                          }
                        />
                      </Field>
                    )}
                  </form.Field>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Invite"}
                  </Button>
                </div>
                <FieldDescription>
                  {type === "project"
                    ? "Project access includes its documents. Team membership alone does not give access."
                    : "Guests can open this document without access to its project."}{" "}
                  Full access also allows sharing. New guests receive an email invitation.
                </FieldDescription>
              </Form>
            ) : data.role === "full_access" ? (
              <div className="text-sm text-muted-foreground">
                <p>Verify your email to manage sharing.</p>
                <ButtonLink
                  href="/settings/team"
                  variant="link"
                  onClick={() => onOpenChange(false)}
                >
                  Open team settings
                </ButtonLink>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You can {data.role === "edit" ? "edit" : "view"} this {type}. Someone with full
                access can change sharing.
              </p>
            )}
            <SharingAccess type={type} id={id} data={data} busy={busy} change={change} />
          </>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <output className="text-xs text-muted-foreground">{notice}</output>
      </DialogContent>
    </Dialog>
  );
}
