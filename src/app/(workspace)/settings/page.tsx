import { redirect } from "next/navigation";
import { requirePageOwner } from "@/server/pages";

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/settings");
  redirect("/settings/appearance");
}
