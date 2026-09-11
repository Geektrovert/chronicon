"use client";

import { useId, useState } from "react";
import { Check, Copy, Globe, Lock } from "lucide-react";
import type { changeSharing, ResourceType } from "@/client/actions/sharing";
import { copyText } from "@/client/actions/files";
import { useTask } from "@/client/runtime";
import type { Sharing } from "@/lib/sharing";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select-field";
import {
  sharingRoleOptions,
  sharingRoleLabel,
  isSharingRole,
  linkAccessDescription,
} from "./sharing-permissions";

type AccessProps = {
  type: ResourceType;
  id: string;
  data: Sharing;
  busy: boolean;
  change: (input: Parameters<typeof changeSharing>[2], message: string) => void;
};

function SharingMembers({ type, data, busy, change }: AccessProps) {
  const fieldId = useId();
  return (
    <>
      {data.members.length > 0 && (
        <section aria-label="People with access" className="border-t border-border pt-4">
          <h2 className="mb-2 text-xs font-medium">People with access</h2>
          <ul className="divide-y divide-border">
            {data.members.map((member) => (
              <li
                key={`${member.userId}:${member.inherited}`}
                className="flex items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  {member.inherited && (
                    <p className="text-xs text-muted-foreground">
                      {type === "project" ? "Project creator" : "Inherited from project"}
                    </p>
                  )}
                </div>
                {data.canManage && member.canRemove ? (
                  <div className="w-36">
                    <SelectField
                      id={`${fieldId}-${member.userId}`}
                      label={`Permission for ${member.email}`}
                      value={member.role}
                      options={sharingRoleOptions}
                      disabled={busy}
                      onValueChange={(role) => {
                        if (isSharingRole(role) && role !== member.role)
                          change(
                            { action: "invite", email: member.email, role },
                            "Permission updated.",
                          );
                      }}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {sharingRoleLabel(member.role)}
                  </span>
                )}
                {data.canManage && member.canRemove && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove access for ${member.email}`}
                    onClick={() =>
                      change(
                        { action: "remove", userId: member.userId },
                        data.members.some(
                          (access) => access.userId === member.userId && access.inherited,
                        )
                          ? "Direct access removed. Project access still applies."
                          : "Access removed.",
                      )
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
    </>
  );
}

function SharingInvitations({ data, busy, change }: AccessProps) {
  return (
    <>
      {data.invitations.length > 0 && (
        <section aria-label="Pending invitations" className="border-t border-border pt-4">
          <h2 className="mb-2 text-xs font-medium">Pending invitations</h2>
          <ul className="divide-y divide-border">
            {data.invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs">{invitation.email}</p>
                <span className="text-xs text-muted-foreground">
                  {sharingRoleLabel(invitation.role)}
                </span>
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SharingLinkAccess({ type, id, data, busy, change }: AccessProps) {
  const fieldId = useId();
  const run = useTask();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const publicAccess = data.visibility === "public" || data.inheritedPublic;
  return (
    <>
      <section aria-label="Link access" className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          {publicAccess ? (
            <Globe className="size-4" aria-hidden="true" />
          ) : (
            <Lock className="size-4" aria-hidden="true" />
          )}
          <Field className="flex-1">
            <FieldLabel htmlFor={`${fieldId}-visibility`}>General access</FieldLabel>
            <SelectField
              id={`${fieldId}-visibility`}
              label="General access"
              value={data.visibility}
              disabled={busy || !data.canManage}
              options={[
                {
                  value: "private",
                  label: data.inheritedPublic ? "Use public project access" : "Only invited people",
                },
                { value: "public", label: "Anyone with the link" },
              ]}
              onValueChange={(value) => {
                if (value === "private" || value === "public")
                  change(
                    {
                      action: "visibility",
                      visibility: value,
                      ...(data.revision === null ? {} : { expectedRevision: data.revision }),
                    },
                    value === "public"
                      ? "Public link enabled."
                      : data.inheritedPublic
                        ? "This document is still public through its project."
                        : "Public link disabled.",
                  );
              }}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{linkAccessDescription(type, data)}</p>
        <div className="flex items-center gap-2">
          {publicAccess && (
            <Input
              aria-label="Public link"
              value={data.publicUrl}
              readOnly
              className="min-w-0 flex-1"
              onFocus={(event) => event.target.select()}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              run(
                copyText(
                  publicAccess
                    ? data.publicUrl
                    : new URL(
                        `/${type === "project" ? "projects" : "documents"}/${encodeURIComponent(id)}`,
                        window.location.origin,
                      ).href,
                  "Unable to copy. Copy the link from your browser's address bar.",
                ),
                { onSuccess: () => setCopied(true), onError: setError },
              )
            }
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : publicAccess ? "Copy link" : "Copy private link"}
          </Button>
        </div>
      </section>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}

export function SharingAccess(props: AccessProps) {
  return (
    <>
      <SharingMembers {...props} />
      <SharingInvitations {...props} />
      <SharingLinkAccess
        key={`${props.data.visibility}:${props.data.inheritedPublic}`}
        {...props}
      />
    </>
  );
}
