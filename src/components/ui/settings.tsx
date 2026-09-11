import type { ReactNode } from "react";
import { ButtonLink } from "./button";
import { PageHeader } from "./page-header";

export function SettingsPage({
  children,
  section = "appearance",
}: {
  children: ReactNode;
  section?: "appearance" | "team" | "account";
}) {
  return (
    <main id="main" tabIndex={-1} className="settings-main" aria-label="Settings">
      <nav aria-label="Settings" className="settings-navigation segmented-control">
        <ButtonLink
          href="/settings/account"
          variant="navigation"
          className="w-auto"
          aria-current={section === "account" ? "page" : undefined}
        >
          Account
        </ButtonLink>
        <ButtonLink
          href="/settings/appearance"
          variant="navigation"
          className="w-auto"
          aria-current={section === "appearance" ? "page" : undefined}
        >
          Appearance
        </ButtonLink>
        <ButtonLink
          href="/settings/team"
          variant="navigation"
          className="w-auto"
          aria-current={section === "team" ? "page" : undefined}
        >
          Team
        </ButtonLink>
      </nav>
      <PageHeader
        title={
          { account: "Account settings", team: "Team settings", appearance: "Appearance" }[section]
        }
      />
      {children}
    </main>
  );
}
