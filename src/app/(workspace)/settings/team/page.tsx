import { Suspense } from "react";
import { TeamSettings } from "@/components/team-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { SettingsPage } from "@/components/ui/settings";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Team settings" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate inside the page's streaming boundary.
async function AuthenticatedTeamSettings() {
  await requirePageOwner("/settings/team");

  return <TeamSettings />;
}

export default function Page() {
  return (
    <SettingsPage section="team">
      <Suspense fallback={<LoadingState>Loading team settings…</LoadingState>}>
        <AuthenticatedTeamSettings />
      </Suspense>
    </SettingsPage>
  );
}
