"use client";

import { useEffect, type ReactNode } from "react";
import type { Library } from "@/lib/model";
import { useWorkspace } from "./workspace";
import { LoadingState } from "./ui/loading-state";

// Keep a directly opened project available while moving between its documents
// and design. Workspace ignores this snapshot outside that project's routes.
export function ProjectScope({ library, children }: { library: Library; children: ReactNode }) {
  const { library: workspaceLibrary, setProjectScope } = useWorkspace();
  useEffect(() => setProjectScope(library), [library, setProjectScope]);
  if (!workspaceLibrary.projects.some((project) => project.id === library.projects[0]?.id))
    return <LoadingState>Loading project…</LoadingState>;
  return children;
}
