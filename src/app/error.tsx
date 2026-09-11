"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { captureError } from "@/client/telemetry";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { boundary: "route", digest: error.digest });
  }, [error]);

  return (
    <main id="main" className="page-loading">
      <EmptyState
        title="Unable to open the workspace"
        description="Check your connection and try again."
      >
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </main>
  );
}
