import type { ReactNode } from "react";
import { workspaceData } from "@/server/pages";
import { Workspace } from "./workspace";
import { TelemetryIdentity } from "./telemetry";

// oxlint-disable-next-line effecttsgo/async-function -- Async React server component is a Next framework boundary.
export async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const workspace = await workspaceData();

  // Each page owns its authenticated redirect (including the return path).
  // Do not cancel its render here, including request-dependent metadata.
  if (!workspace) return children;

  return (
    <Workspace initialLibrary={workspace.library} name={workspace.name}>
      <TelemetryIdentity userId={workspace.userId} />
      {children}
    </Workspace>
  );
}
