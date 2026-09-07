import { LibraryView } from "@/components/library-view";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Archive" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/archive");
  return <LibraryView section="archived" />;
}
