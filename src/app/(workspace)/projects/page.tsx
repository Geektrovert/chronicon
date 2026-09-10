import { Suspense } from "react";
import { ProjectsView } from "@/components/projects-view";
import { LoadingState } from "@/components/ui/loading-state";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Projects" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
async function AuthenticatedProjects() {
  await requirePageOwner("/projects");
  return <ProjectsView />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState>Loading projects…</LoadingState>}>
      <AuthenticatedProjects />
    </Suspense>
  );
}
