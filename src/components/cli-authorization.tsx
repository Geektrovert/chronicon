"use client";

import { useState, useTransition } from "react";
import { Result } from "effect";
import { authorizeCli } from "@/client/actions/cli-auth";
import { runAction } from "@/client/runtime";
import type { cliAuthorization } from "@/lib/cli-auth";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { FieldError } from "./ui/field";
import { PageHeader } from "./ui/page-header";

export function CliAuthorization({
  input,
  account,
}: {
  input: typeof cliAuthorization.Type;
  account: string;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <main className="signin-page">
      <Brand />
      <div className="signin-form space-y-5">
        <PageHeader title="Connect your terminal" />
        <p>
          Signed in as {account}. The Chronicon CLI can read and publish projects and documents in
          your account for 30 days. You can revoke access in Settings.
        </p>
        <p className="text-sm text-muted-foreground">
          Approve only if you started this login in your terminal.
        </p>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              start(() =>
                runAction(authorizeCli(input)).then((result) => {
                  if (Result.isFailure(result)) setError(result.failure);
                }),
              );
            }}
          >
            {busy ? "Connecting…" : "Authorize CLI"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              const callback = new URL(input.redirectUri);
              callback.searchParams.set("error", "access_denied");
              callback.searchParams.set("state", input.state);
              window.location.assign(callback.href);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </main>
  );
}
