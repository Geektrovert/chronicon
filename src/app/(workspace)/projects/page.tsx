import { ProjectsView } from "@/components/projects-view";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Projects" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/projects");
  return <ProjectsView />;
}
