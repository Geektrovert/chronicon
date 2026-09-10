import { LibraryView } from "@/components/library-view";
import { ProjectScope } from "@/components/project-scope";
import { pagePrincipal, projectPageData, projectLibraryPageData } from "@/server/pages";

// oxlint-disable-next-line effecttsgo/async-function -- Next metadata boundary shares the request-scoped page lookup.
export async function generateMetadata({ params }: PageProps<"/projects/[slug]">) {
  if (!(await pagePrincipal())) return { title: "Sign in" };
  const { slug } = await params;
  return { title: (await projectPageData(slug)).name };
}

// oxlint-disable-next-line effecttsgo/async-function -- Next route params and server data are awaited at the page boundary.
export default async function Page({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const { project, library } = await projectLibraryPageData(slug);
  return (
    <ProjectScope library={library}>
      <LibraryView key={project.id} projectId={project.id} />
    </ProjectScope>
  );
}
