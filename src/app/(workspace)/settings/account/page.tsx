import { Suspense } from "react";
import { AccountSettings } from "@/components/account-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { SettingsPage } from "@/components/ui/settings";
import { readPublicProfile } from "@/server/actions/profile";
import { requirePageOwner } from "@/server/pages";
import { runObservedPage } from "@/server/request-telemetry";

export const metadata = { title: "Account settings" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate inside the page's streaming boundary.
async function AuthenticatedAccountSettings() {
  const principal = await requirePageOwner("/settings/account");
  const profile = await runObservedPage(
    "page.account_settings",
    "/settings/account",
    readPublicProfile(principal),
    principal,
  );
  return <AccountSettings initialProfile={profile} emailVerified={principal.emailVerified} />;
}

export default function Page() {
  return (
    <SettingsPage section="account">
      <Suspense fallback={<LoadingState>Loading account settings…</LoadingState>}>
        <AuthenticatedAccountSettings />
      </Suspense>
    </SettingsPage>
  );
}
