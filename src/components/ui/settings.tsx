import type { ReactNode } from "react";
import { ButtonLink } from "./button";

export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8"
      aria-label="Settings"
    >
      <nav
        aria-label="Settings"
        className="mb-8 flex items-center gap-4 border-b border-border pb-4"
      >
        <span className="text-sm text-muted-foreground">Settings</span>
        <ButtonLink
          href="/settings/appearance"
          variant="navigation"
          className="w-auto"
          aria-current="page"
        >
          Appearance
        </ButtonLink>
      </nav>
      <h1 className="sr-only">Appearance</h1>
      {children}
    </main>
  );
}
