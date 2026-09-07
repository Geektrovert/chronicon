"use client";

import { Code2, Eye } from "lucide-react";
import { Button } from "./button";

export function ViewModeControl({
  source,
  onSourceChange,
}: {
  source: boolean;
  onSourceChange: (source: boolean) => void;
}) {
  return (
    <fieldset aria-label="Document view" className="flex gap-1 rounded-lg bg-muted p-1">
      <Button
        type="button"
        size="sm"
        variant={source ? "ghost" : "outline"}
        aria-pressed={!source}
        onClick={() => onSourceChange(false)}
      >
        <Eye />
        Preview
      </Button>
      <Button
        type="button"
        size="sm"
        variant={source ? "outline" : "ghost"}
        aria-pressed={source}
        onClick={() => onSourceChange(true)}
      >
        <Code2 />
        Source
      </Button>
    </fieldset>
  );
}
