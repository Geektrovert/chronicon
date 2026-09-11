import { AppearanceSettings } from "@/components/appearance-settings";
import { SettingsPage } from "@/components/ui/settings";
import { requirePageOwner } from "@/server/pages";

export const metadata = { title: "Appearance settings" };

// oxlint-disable-next-line effecttsgo/async-function -- Authenticate at the Next page boundary.
export default async function Page() {
  await requirePageOwner("/settings/appearance");

  return (
    <SettingsPage>
      <AppearanceSettings />
    </SettingsPage>
  );
}
