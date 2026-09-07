import { LibraryView } from "@/components/library-view";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Starred documents" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/starred");
  return <LibraryView section="starred" />;
}
