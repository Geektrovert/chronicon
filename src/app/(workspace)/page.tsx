import { LibraryView } from "@/components/library-view";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "All documents" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/");
  return <LibraryView />;
}
