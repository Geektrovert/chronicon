import { Suspense } from "react";
import { notFound } from "next/navigation";
import { InvitationAccept } from "@/components/invitation-accept";
import { LoadingState } from "@/components/ui/loading-state";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Invitation" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
async function InvitationPage({ params, searchParams }: PageProps<"/invitations/[id]">) {
  const { id } = await params;
  const { type = "team" } = await searchParams;
  if (type !== "team" && type !== "resource") notFound();
  await requirePageOwner(`/invitations/${encodeURIComponent(id)}?type=${type}`);
  return <InvitationAccept id={id} type={type} />;
}

export default function Page(props: PageProps<"/invitations/[id]">) {
  return (
    <Suspense fallback={<LoadingState>Loading invitation…</LoadingState>}>
      <InvitationPage {...props} />
    </Suspense>
  );
}
