"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Struct } from "effect";
import type { ProjectDesign, DesignSettings } from "@/lib/project-design/model";

type DesignValues = { settings: DesignSettings; guidance: string };

type DesignDraft = { base: ProjectDesign; values: DesignValues };

const DraftsContext = createContext<Map<string, DesignDraft> | null>(null);

export function designChanged(values: DesignValues, saved: ProjectDesign) {
  return (
    values.guidance !== saved.guidance ||
    Struct.keys(values.settings).some((key) => saved.settings[key] !== values.settings[key])
  );
}

export function DesignDraftsProvider({ children }: { children: ReactNode }) {
  // Drafts belong to this signed-in workspace session. Keeping the original
  // revision makes a restored draft obey the same conflict checks as a new edit.
  const [drafts] = useState(() => new Map<string, DesignDraft>());
  useEffect(() => {
    const protectDrafts = (event: BeforeUnloadEvent) => {
      if (!drafts.size) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", protectDrafts);

    return () => window.removeEventListener("beforeunload", protectDrafts);
  }, [drafts]);

  return <DraftsContext value={drafts}>{children}</DraftsContext>;
}

export function useDesignDrafts() {
  const drafts = use(DraftsContext);

  if (!drafts) throw new Error("Design drafts require the workspace layout.");

  return drafts;
}
