"use client";

import { Code2, Eye } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export function ViewModeControl({
  source,
  onSourceChange,
  disabled = false,
}: {
  source: boolean;
  onSourceChange: (source: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <TooltipProvider delay={400}>
      <fieldset
        aria-label="Document view"
        disabled={disabled}
        className="view-mode-control flex gap-1 rounded-xl bg-muted p-1"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={source ? "ghost" : "outline"}
                aria-pressed={!source}
                aria-label="Preview"
                disabled={disabled}
                onClick={() => onSourceChange(false)}
              >
                <Eye aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Preview</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={source ? "outline" : "ghost"}
                aria-pressed={source}
                aria-label="Source"
                disabled={disabled}
                onClick={() => onSourceChange(true)}
              >
                <Code2 aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Source</TooltipContent>
        </Tooltip>
      </fieldset>
    </TooltipProvider>
  );
}
