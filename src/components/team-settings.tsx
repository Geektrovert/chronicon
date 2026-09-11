"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { Result } from "effect";
import { Users } from "lucide-react";
import { requestEmailVerification } from "@/client/actions/auth";
import { changeTeam, loadTeams, switchTeam } from "@/client/actions/team";
import { runAction, useTask } from "@/client/runtime";
import type { Teams } from "@/lib/sharing";
import { Button } from "./ui/button";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Form } from "./ui/form";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function TeamSwitcher({ compact }: { compact: boolean }) {
  const run = useTask();
  const [data, setData] = useState<Teams | null>(null);
  const [error, setError] = useState("");
  const [busy, submit] = useTransition();
  useEffect(() => run(loadTeams, { onSuccess: setData, onError: setError }), [run]);
  const active = data?.teams.find((team) => team.id === data.activeTeamId);

  return (
    <div>
      <div className="sidebar-control-row">
        <Select
          items={data?.teams.map((team) => ({ value: team.id, label: team.name }))}
          value={data?.activeTeamId ?? null}
          disabled={!data || busy}
          onValueChange={(value) => {
            if (!value || value === data?.activeTeamId || busy) return;
            setError("");
            submit(() =>
              runAction(switchTeam(value)).then((result) => {
                if (Result.isFailure(result)) setError(result.failure);
              }),
            );
          }}
        >
          <SelectTrigger
            variant="navigation"
            className="sidebar-project-trigger"
            aria-label="Choose team"
            title={compact ? active?.name : undefined}
          >
            <Users aria-hidden="true" />
            <SelectValue className="sidebar-control-label" placeholder="Loading team…" />
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            className="min-w-56 max-w-80 p-1"
          >
            {data?.teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                <span className="truncate">{team.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p role="alert" className="error-text text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export function TeamSettings() {
  const run = useTask();
  const fieldId = useId();
  const [data, setData] = useState<Teams | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, submit] = useTransition();
  useEffect(() => run(loadTeams, { onSuccess: setData, onError: setError }), [run]);
  const active = data?.teams.find((team) => team.id === data.activeTeamId);
  const currentMember = data?.members.find((member) => member.userId === data.userId);

  function change(input: Parameters<typeof changeTeam>[0], message: string) {
    if (busy) return;
    setError("");
    setNotice("");
    submit(() =>
      runAction(changeTeam(input)).then((result) => {
        if (Result.isFailure(result)) {
          setError(result.failure);

          return;
        }

        setData(result.success);
        setNotice(message);

        if (input.action === "invite") form.reset();
      }),
    );
  }

  const form = useForm({
    // SAFETY: The literal is one of the team invitation roles accepted by this form.
    defaultValues: { email: "", role: "member" as "member" | "admin" },
    onSubmit: ({ value }) => change({ action: "invite", ...value }, "Invitation sent."),
  });

  return (
    <div className="space-y-8">
      <header>
        <h2 className="content-title text-xl">{active?.name ?? "Team"}</h2>
        <p className="content-description mt-2 text-sm text-muted-foreground">
          Invite people to your team, then add them to the projects they need.
        </p>
      </header>
      {!data && !error && <p className="text-sm text-muted-foreground">Loading team…</p>}
      {data && !data.emailVerified && currentMember && (
        <section
          className="space-y-3 rounded-lg border border-border p-4"
          aria-label="Email verification"
        >
          <p className="text-sm">Verify {currentMember.email} before inviting people.</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError("");
              submit(() =>
                runAction(requestEmailVerification(currentMember.email, "/settings/team")).then(
                  (result) => {
                    if (Result.isFailure(result)) setError(result.failure);
                    else setNotice("Verification email sent. Open its link to continue.");
                  },
                ),
              );
            }}
          >
            Send verification email
          </Button>
        </section>
      )}
      {data?.canManage && (
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <form.Field name="email">
              {(field) => (
                <Field className="min-w-48 flex-1">
                  <FieldLabel htmlFor={`${fieldId}-email`}>Email</FieldLabel>
                  <Input
                    id={`${fieldId}-email`}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    maxLength={254}
                    value={field.state.value}
                    disabled={busy || !data.emailVerified}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <Field className="w-36">
                  <FieldLabel htmlFor={`${fieldId}-role`}>Role</FieldLabel>
                  <SelectField
                    id={`${fieldId}-role`}
                    label="Team role"
                    value={field.state.value}
                    disabled={busy || !data.emailVerified}
                    onBlur={field.handleBlur}
                    onValueChange={(value) => {
                      if (value === "member" || value === "admin") field.handleChange(value);
                    }}
                    options={[
                      { value: "member", label: "Member" },
                      { value: "admin", label: "Admin" },
                    ]}
                  />
                </Field>
              )}
            </form.Field>
            <Button type="submit" disabled={busy || !data.emailVerified}>
              {busy ? "Saving…" : "Send invitation"}
            </Button>
          </div>
          <FieldDescription>
            Admins can invite and remove team members. Project and document permissions are managed
            separately.
          </FieldDescription>
        </Form>
      )}
      {data && (
        <section aria-label="Team members">
          <h2 className="mb-3 text-sm font-medium">Members</h2>
          <ul className="divide-y divide-border border-y border-border">
            {data.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans">
                    {member.name}
                    {member.userId === data.userId ? " · You" : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                {data.canManage && member.role !== "owner" && member.userId !== data.userId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${member.email} from team`}
                    onClick={() =>
                      change({ action: "remove", memberId: member.id }, "Member removed.")
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && data.invitations.length > 0 && (
        <section aria-label="Pending team invitations">
          <h2 className="mb-3 text-sm font-medium">Pending invitations</h2>
          <ul className="divide-y divide-border border-y border-border">
            {data.invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-xs">{invitation.email}</span>
                <span className="text-xs text-muted-foreground capitalize">{invitation.role}</span>
                {data.canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Cancel invitation for ${invitation.email}`}
                    onClick={() =>
                      change(
                        { action: "cancel", invitationId: invitation.id },
                        "Invitation canceled.",
                      )
                    }
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <output className="text-sm text-muted-foreground">{notice}</output>
    </div>
  );
}
