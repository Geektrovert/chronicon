"use client";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
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
