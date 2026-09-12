"use client";

import { Form, FieldGroup } from "./ui/form";
import { useForm } from "@tanstack/react-form";
import { Field, FieldLabel, FieldError, FieldDescription } from "./ui/field";
import { SelectField } from "./ui/select-field";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDate } from "@/lib/date";
import { Check, Copy, KeyRound, Terminal, Trash2 } from "lucide-react";
import type { Project } from "@/lib/model";
import { createAgentKey, revokeAgentKey, loadKeys, type AgentKey } from "@/client/actions/keys";
import { copyText } from "@/client/actions/files";
import { useTask } from "@/client/runtime";
import { capture } from "@/client/telemetry";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function AgentSettings({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ReadonlyArray<Project>;
}) {
  useEffect(() => {
    if (open) capture("agent_connection_opened");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogDescription>
            Choose which projects an agent can access and what it can do.
          </DialogDescription>
        </DialogHeader>
        {open && <SettingsForm projects={projects} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ projects }: { projects: ReadonlyArray<Project> }) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const run = useTask();
  const [keys, setKeys] = useState<ReadonlyArray<AgentKey>>([]);
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string>();

  function reload() {
    run(loadKeys, { onSuccess: (data) => setKeys(data.apiKeys), onError: setError });
  }

  useEffect(
    () =>
      run(loadKeys, {
        onSuccess: (data) => setKeys(data.apiKeys),
        onError: setError,
      }),
    [run],
  );

  const form = useForm({
    defaultValues: { name: "", project: projects[0]?.id || "all", access: "write", days: "90" },
    onSubmit: ({ value }) => {
      if (busy) return;
      setBusy(true);
      setError("");
      run(
        createAgentKey({
          name: value.name,
          projectIds: value.project === "all" ? null : [value.project],
          write: value.access === "write",
          days: Number(value.days),
        }),
        {
          onSuccess: (created) => {
            setNewKey(created.key);
            reload();
          },
          onError: setError,
          onSettled: () => setBusy(false),
        },
      );
    },
  });

  const endpoint = origin ? `${origin}/api/mcp` : "";

  const config = JSON.stringify(
    {
      mcpServers: {
        chronicon: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${newKey || "YOUR_AGENT_KEY"}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="settings-content">
      <div className="connection-address">
        <Terminal size={17} />
        <span>{endpoint}</span>
        <span className="tag">MCP</span>
      </div>
      {!newKey ? (
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="agent-settings-field-1">Agent name</FieldLabel>
                <Input
                  id="agent-settings-field-1"
                  name="name"
                  placeholder="Codex"
                  required
                  maxLength={60}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>
          <FieldGroup columns={3}>
            <form.Field name="project">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="agent-settings-select-1">Project</FieldLabel>
                  <SelectField
                    onBlur={field.handleBlur}
                    id="agent-settings-select-1"
                    label="Project"
                    name="project"
                    options={[
                      ...projects.map((p) => ({ value: p.id, label: p.name })),
                      { value: "all", label: "All projects" },
                    ]}

                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="access">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="agent-settings-select-2">Access</FieldLabel>
                  <SelectField
                    onBlur={field.handleBlur}
                    id="agent-settings-select-2"
                    label="Access"
                    name="access"
                    options={[
                      { value: "read", label: "Read" },
                      { value: "write", label: "Write" },
                    ]}

                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="days">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="agent-settings-select-3">Expires in</FieldLabel>
                  <SelectField
                    onBlur={field.handleBlur}
                    id="agent-settings-select-3"
                    label="Expires in"
                    name="days"
                    options={[
                      { value: "30", label: "30 days" },
                      { value: "90", label: "90 days" },
                      { value: "365", label: "1 year" },
                    ]}

                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <FieldDescription>
            Write access lets an agent read, create, and edit content. Sharing documents also
            requires your verified email and full access. Keys stay within one team and your current
            permissions.
          </FieldDescription>
          <Button type="submit" disabled={busy}>
            <KeyRound size={16} />
            {busy ? "Creating key…" : "Create agent key"}
          </Button>
        </Form>
      ) : (
        <div className="new-key">
          <div className="success-note">
            <Check size={17} />
            Key created. Copy this configuration now. The key won't be shown again.
          </div>
          <pre className="connection-code">
            <code>{config}</code>
          </pre>
          <Button
            variant="outline"
            onClick={() =>
              run(copyText(config, "Unable to copy. Select and copy the configuration above."), {
                onSuccess: () => {
                  setCopied(true);
                  capture("agent_configuration_copied");
                },
                onError: setError,
              })
            }
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy MCP configuration"}
          </Button>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
      <div className="agent-help">
        <p>Add the configuration to your agent's MCP settings.</p>
      </div>
      <section className="key-list">
        <h2>Agent keys</h2>
        {!keys.length && <p className="muted">No agent keys yet. Create one above.</p>}
        {keys.map((key) => (
          <div key={key.id} className="key-row">
            <KeyRound size={17} />
            <div>
              <strong>{key.name || "Agent"}</strong>
              <p>
                {key.metadata?.projectIds
                  ? key.metadata.projectIds
                      .map((id) => projects.find((p) => p.id === id)?.name || "Project")
                      .join(", ")
                  : "All projects"}{" "}
                · {key.expiresAt ? `Expires ${formatDate(key.expiresAt)}` : "Never expires"}
              </p>
            </div>
            <Button
              variant="ghost"
              aria-label={`Revoke ${key.name || "agent"} key`}
              onClick={() => setRevokeId(key.id)}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
      </section>
      {revokeId && (
        <div role="alert" className="revoke-confirm">
          <p>Revoke this key? Its agent will lose access immediately.</p>
          <Button
            variant="destructive"
            onClick={() =>
              run(revokeAgentKey(revokeId), {
                onSuccess: () => {
                  setRevokeId(undefined);
                  reload();
                },
                onError: setError,
              })
            }
          >
            Revoke key
          </Button>
          <Button variant="ghost" onClick={() => setRevokeId(undefined)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
