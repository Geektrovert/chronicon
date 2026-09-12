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
        className="view-mode-control segmented-control"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-pressed={!source}
                aria-label="Preview document"
                disabled={disabled}
                onClick={() => onSourceChange(false)}
              >
                <Eye aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Preview document</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-pressed={source}
                aria-label="View HTML source"
                disabled={disabled}
                onClick={() => onSourceChange(true)}
              >
                <Code2 aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">View HTML source</TooltipContent>
        </Tooltip>
      </fieldset>
    </TooltipProvider>
  );
}
