"use client";
import { Button, ButtonLink } from "./ui/button";
import { Brand } from "./brand";
import {
  Archive,
  Code2,
  FileText,
  Folder,
  LogOut,
  Keyboard,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { signOut } from "@/client/actions/auth";
import { useState } from "react";
import { useTask } from "@/client/runtime";
import type { Library } from "@/lib/model";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export function WorkspaceSidebar({
  shortcutLabel,
  keyboardSettings,
  library,
  name,
  pathname,
  projectId,
  mobileOpen,
  createProject,
  search,
  settings,
  close,
}: {
  shortcutLabel: string;
  keyboardSettings: () => void;
  library: Library;
  name: string;
  pathname: string;
  projectId?: string;
  mobileOpen: boolean;
  createProject: () => void;
  search: () => void;
  settings: () => void;
  close: () => void;
}) {
  const run = useTask();
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const content = (
    <>
      <Brand onNavigate={close} />
      <Button variant="outline" className="mb-5 w-full justify-start" onClick={search}>
        <Search size={16} />
        <span className="min-w-0 flex-1 truncate text-left">Search</span>
        {shortcutLabel !== "Disabled" && (
          <kbd className="text-[10px]">{shortcutLabel.replace("Ctrl/Cmd+", "⌘/Ctrl ")}</kbd>
        )}
      </Button>
      <nav className="nav-group" aria-label="Library">
        {[
          { href: "/", label: "All documents", icon: FileText },
          { href: "/starred", label: "Starred", icon: Star },
          { href: "/archive", label: "Archive", icon: Archive },
        ].map((item) => (
          <ButtonLink
            variant="navigation"
            key={item.href}
            href={item.href}
            onNavigate={close}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <item.icon size={17} />
            <span>{item.label}</span>
            {item.href === "/" && (
              <span className="nav-count">
                {library.documents.filter((d) => !d.archived).length}
              </span>
            )}
          </ButtonLink>
        ))}
      </nav>
      <div className="project-label">
        <span>Projects</span>
        <Button variant="ghost" size="icon-sm" aria-label="Create project" onClick={createProject}>
          <Plus size={15} />
        </Button>
      </div>
      <nav className="nav-group projects-nav" aria-label="Projects">
        {library.projects.map((p) => (
          <ButtonLink
            variant="navigation"
            key={p.id}
            href={`/projects/${p.slug}`}
            onNavigate={close}
            aria-current={
              projectId === p.id
                ? pathname === `/projects/${p.slug}`
                  ? "page"
                  : "location"
                : undefined
            }
          >
            <Folder size={16} />
            <span className="nav-project-name">{p.name}</span>
          </ButtonLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Button variant="navigation" onClick={settings}>
          <Code2 size={17} />
          <span>Connect an agent</span>
        </Button>
        <Button variant="navigation" onClick={keyboardSettings}>
          <Keyboard size={17} />
          <span>Shortcuts</span>
        </Button>
        <div className="account-row">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <span>{name}</span>
          {signOutError && (
            <span role="alert" className="error-text">
              {signOutError}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={signingOut ? "Signing out…" : "Sign out"}
            disabled={signingOut}
            onClick={() => {
              setSignOutError("");
              setSigningOut(true);
              run(signOut, {
                onError: (error) => {
                  setSignOutError(error);
                  setSigningOut(false);
                },
              });
            }}
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </>
  );
  return (
    <>
      <aside className="sidebar desktop-sidebar" aria-label="Workspace navigation">
        {content}
      </aside>
      <Dialog
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="sidebar mobile-sidebar is-open" showCloseButton={false}>
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">Browse projects and documents.</DialogDescription>
          {content}
          <Button variant="outline" className="mt-4" onClick={close}>
            Close navigation
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
