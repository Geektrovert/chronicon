import { ProjectDesignEditor } from "@/components/project-design/editor";
import { ProjectScope } from "@/components/project-scope";
import { Suspense } from "react";
import { connection } from "next/server";
import { LoadingState } from "@/components/ui/loading-state";
import { requirePageOwner, projectLibraryPageData } from "@/server/pages";
import { readProjectDesign } from "@/server/actions/project-design";
import { runObservedPage } from "@/server/request-telemetry";

export const metadata = { title: "Design system" };

// oxlint-disable-next-line effecttsgo/async-function -- Next params, authorization and initial data are awaited at the page boundary.
async function DesignContent({ params }: PageProps<"/projects/[slug]/design">) {
  await connection();
  const { slug } = await params;
  const principal = await requirePageOwner(`/projects/${slug}/design`);
  const { project, library } = await projectLibraryPageData(slug);
  const design = await runObservedPage(
    "page.project_design",
    "/projects/[slug]/design",
    readProjectDesign(principal, { project: { id: project.id } }),
    principal,
  );
  return (
    <ProjectScope library={library}>
      <ProjectDesignEditor key={project.id} project={project} initial={design} />
    </ProjectScope>
  );
}

export default function Page(props: PageProps<"/projects/[slug]/design">) {
  return (
    <Suspense fallback={<LoadingState>Loading design system…</LoadingState>}>
      <DesignContent {...props} />
    </Suspense>
  );
}
