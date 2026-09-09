import { ProjectDesignEditor } from "@/components/project-design/editor";
import { Suspense } from "react";
import { connection } from "next/server";
import { LoadingState } from "@/components/ui/loading-state";
import { requirePageOwner, projectPageData } from "@/server/pages";
import { readProjectDesign } from "@/server/actions/project-design";
import { runtime } from "@/server/runtime";

export const metadata = { title: "Design system" };

// oxlint-disable-next-line effecttsgo/async-function -- Next params, authorization and initial data are awaited at the page boundary.
async function DesignContent({ params }: PageProps<"/projects/[slug]/design">) {
  await connection();
  const { slug } = await params;
  const principal = await requirePageOwner(`/projects/${slug}/design`);
  const project = await projectPageData(slug);
  const design = await runtime.runPromise(
    readProjectDesign(principal, { project: { id: project.id } }),
  );
  return <ProjectDesignEditor key={project.id} project={project} initial={design} />;
}

export default function Page(props: PageProps<"/projects/[slug]/design">) {
  return (
    <Suspense fallback={<LoadingState>Loading design system…</LoadingState>}>
      <DesignContent {...props} />
    </Suspense>
  );
}
