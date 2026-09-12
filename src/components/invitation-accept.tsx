"use client";

import { useEffect, useState, useTransition } from "react";
import { Result } from "effect";
import { acceptInvitation, loadInvitation } from "@/client/actions/sharing";
import { requestEmailVerification, signOutTo } from "@/client/actions/auth";
import { runAction, useTask } from "@/client/runtime";
import type { Invitation } from "@/lib/sharing";
import { Brand } from "./brand";
import { Button, ButtonLink } from "./ui/button";

export function InvitationAccept({ id, type }: { id: string; type: "team" | "resource" }) {
  const run = useTask();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, submit] = useTransition();
  useEffect(
    () => run(loadInvitation(id, type), { onSuccess: setInvitation, onError: setError }),
    [id, type, run],
  );
  const invitationPath = `/invitations/${encodeURIComponent(id)}?type=${type}`;
  const pending = invitation?.status === "pending";

  return (
    <main className="signin-page">
      <Brand />
      <section className="signin-form space-y-5" aria-labelledby="invitation-title">
        <h1 id="invitation-title" className="content-title text-2xl">
          {type === "team" ? "Team invitation" : "Sharing invitation"}
        </h1>
        {!invitation && !error && (
          <p className="text-sm text-muted-foreground">Loading invitation…</p>
        )}
        {invitation && (
          <>
            <p className="content-description text-muted-foreground">
              {invitation.inviterName} invited you to {invitation.resourceName}.
            </p>
            <p className="text-sm">Sent to {invitation.email}</p>
            {pending ? (
              invitation.requiresEmailVerification ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Verify your email address to accept this invitation.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      submit(() =>
                        runAction(requestEmailVerification(invitation.email, invitationPath)).then(
                          (result) => {
                            if (Result.isFailure(result)) setError(result.failure);
                            else
                              setNotice(
                                "Verification email sent. Follow the link in your inbox to return here.",
                              );
                          },
                        ),
                      );
                    }}
                  >
                    {busy ? "Sending…" : "Send verification email"}
                  </Button>
                </div>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    submit(() =>
                      runAction(acceptInvitation(id, type)).then((result) => {
                        if (Result.isFailure(result)) setError(result.failure);
                      }),
                    );
                  }}
                >
                  {busy ? "Accepting…" : "Accept invitation"}
                </Button>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {invitation.status === "accepted"
                  ? "You already accepted this invitation."
                  : "This invitation is no longer available. Ask the sender for a new invitation."}
              </p>
            )}
            {invitation.status === "accepted" && (
              <ButtonLink href="/" variant="outline">
                Open workspace
              </ButtonLink>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {error && !invitation && (
          <p className="text-sm text-muted-foreground">
            Use the account with the email address that received this invitation.
          </p>
        )}
        <output className="text-sm text-muted-foreground">{notice}</output>
        <Button
          variant="link"
          disabled={busy}
          onClick={() => run(signOutTo(invitationPath), { onError: setError })}
        >
          Sign out
        </Button>
      </section>
    </main>
  );
}
