"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DateTime } from "effect";
import {
  Archive,
  Code2,
  FileText,
  Folder,
  FolderPlus,
  Keyboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  SquarePen,
  Star,
  X,
} from "lucide-react";
import { signOut } from "@/client/actions/auth";
import { watchSidebarTime, type SidebarLayout } from "@/client/actions/sidebar";
import { useTask } from "@/client/runtime";
import { formatRelativeDate, formatTimestamp } from "@/lib/date";
import { formatBinding, type Keybindings } from "@/lib/keybindings";
import type { Library } from "@/lib/model";
import { Brand } from "./brand";
import { Button, ButtonLink } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarDocumentLink,
  SidebarFooter,
  SidebarHeader,
} from "./ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function WorkspaceSidebar({
  bindings,
  keyboardSettings,
  library,
  name,
  pathname,
  layout,
  maximumWidth,
  resize,
  resizeEnd,
  toggleCollapsed,
  mobileOpen,
  createProject,
  publish,
  search,
  settings,
  close,
}: {
  bindings: Keybindings;
  keyboardSettings: () => void;
  library: Library;
  name: string;
  pathname: string;
  layout: SidebarLayout;
  maximumWidth: number;
  resize: (layout: SidebarLayout) => void;
  resizeEnd: (layout: SidebarLayout) => void;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  createProject: () => void;
  publish: () => void;
  search: () => void;
  settings: () => void;
  close: () => void;
}) {
  const router = useRouter();
  const run = useTask();
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [now, setNow] = useState<DateTime.Utc>();
  const activeDocument = library.documents.find((doc) => pathname === `/documents/${doc.id}`);
  const collectionPath = pathname.replace(/^(\/projects\/[^/]+)\/design\/?$/, "$1");
  const [scope, setScope] = useState({
    pathname,
    collection: pathname.startsWith("/documents/")
      ? activeDocument?.archived
        ? "/archive"
        : "/"
      : collectionPath,
    limit: 40,
  });
  const project = library.projects.find((item) => scope.collection === `/projects/${item.slug}`);

  // Keep the originating collection while opening its documents. Direct links
  // and Back navigation outside that collection return to an appropriate list.
  if (scope.pathname !== pathname) {
    let collection = scope.collection;
    if (!pathname.startsWith("/documents/")) collection = collectionPath;
    else if (
      activeDocument &&
      ((project && activeDocument.projectId !== project.id) ||
        (scope.collection === "/starred" && !activeDocument.starred) ||
        (scope.collection === "/archive") !== activeDocument.archived)
    )
      collection = activeDocument.archived ? "/archive" : "/";
    setScope({ pathname, collection, limit: collection === scope.collection ? scope.limit : 40 });
  }

  const projectsById = new Map(library.projects.map((item) => [item.id, item]));
  const documents = library.documents
    .filter(
      (document) =>
        (!project || document.projectId === project.id) &&
        (scope.collection === "/archive" ? document.archived : !document.archived) &&
        (scope.collection !== "/starred" || document.starred),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const visibleCount = Math.max(
    scope.limit,
    documents.findIndex((document) => document.id === activeDocument?.id) + 1,
  );
  const projectOptions = [
    { value: "all", label: "All projects" },
    ...library.projects.map((item) => ({ value: item.id, label: item.name })),
  ];

  useEffect(() => run(watchSidebarTime(setNow)), [run]);

  return (
    <Sidebar
      layout={layout}
      maximumWidth={maximumWidth}
      onResize={resize}
      onResizeEnd={resizeEnd}
      mobileOpen={mobileOpen}
      onMobileOpenChange={close}
    >
      {({ compact, mobile }) => (
        <>
          <SidebarHeader>
            <div className="sidebar-brand-row">
              <SidebarAction
                label={
                  mobile ? "Close navigation" : compact ? "Expand sidebar" : "Collapse sidebar"
                }
                shortcut={mobile ? undefined : formatBinding(bindings.sidebar)}
                aria-expanded={!compact}
                aria-controls={mobile ? undefined : "sidebar-documents"}
                onClick={mobile ? close : toggleCollapsed}
              >
                {mobile ? <X /> : compact ? <PanelLeftOpen /> : <PanelLeftClose />}
              </SidebarAction>
              <Brand onNavigate={close} />
            </div>
            <div className="sidebar-control-row">
              <SidebarAction
                label="Search documents"
                shortcut={formatBinding(bindings.search)}
                variant="navigation"
                size="default"
                className="sidebar-search"
                onClick={search}
              >
                <Search />
                <span className="sidebar-control-label">Search</span>
                {bindings.search && (
                  <kbd className="sidebar-shortcut" aria-hidden="true">
                    {formatBinding(bindings.search).replace("Ctrl/Cmd+", "⌘/Ctrl ")}
                  </kbd>
                )}
              </SidebarAction>
              <SidebarAction
                label="New document"
                shortcut={formatBinding(bindings.document)}
                onClick={publish}
              >
                <SquarePen />
              </SidebarAction>
            </div>
            <div className="sidebar-control-row">
              <Select
                items={projectOptions}
                value={project?.id ?? "all"}
                onValueChange={(value) => {
                  if (!value) return;
                  const selected = projectsById.get(value);
                  const href = selected ? `/projects/${selected.slug}` : "/";
                  setScope({ pathname, collection: href, limit: 40 });
                  close();
                  startTransition(() => router.push(href));
                }}
              >
                <SelectTrigger
                  variant="navigation"
                  className="sidebar-project-trigger"
                  aria-label="Choose project"
                  title={compact ? (project?.name ?? "All projects") : undefined}
                >
                  <Folder aria-hidden="true" />
                  <SelectValue className="sidebar-control-label" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  className="min-w-56 max-w-80 p-1"
                >
                  {projectOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="min-h-9">
                      <span className="truncate">{item.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SidebarAction
                label="Create project"
                shortcut={formatBinding(bindings.project)}
                onClick={createProject}
              >
                <FolderPlus />
              </SidebarAction>
            </div>
            <nav className="sidebar-library-nav" aria-label="Library">
              {[
                {
                  href: project ? `/projects/${project.slug}` : "/",
                  label: "All documents",
                  short: "All",
                  icon: FileText,
                },
                { href: "/starred", label: "Starred documents", short: "Starred", icon: Star },
                { href: "/archive", label: "Archive", short: "Archive", icon: Archive },
              ].map((item) => (
                <Tooltip key={item.label}>
                  <TooltipTrigger
                    render={
                      <ButtonLink
                        variant="navigation"
                        className="sidebar-library-link"
                        href={item.href}
                        onNavigate={close}
                        aria-label={item.label}
                        aria-current={
                          pathname === item.href
                            ? "page"
                            : scope.collection === item.href
                              ? "location"
                              : undefined
                        }
                      />
                    }
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.short}</span>
                  </TooltipTrigger>
                  <TooltipContent>{item.label}</TooltipContent>
                </Tooltip>
              ))}
            </nav>
          </SidebarHeader>
          <SidebarContent
            id={mobile ? "mobile-sidebar-documents" : "sidebar-documents"}
            aria-label={
              project
                ? `${project.name} documents`
                : scope.collection === "/starred"
                  ? "Starred documents"
                  : scope.collection === "/archive"
                    ? "Archived documents"
                    : "Recent documents"
            }
          >
            <div className="sidebar-document-list">
              {documents.slice(0, visibleCount).map((document) => (
                <SidebarDocumentLink
                  key={document.id}
                  href={`/documents/${document.id}`}
                  onNavigate={close}
                  aria-label={document.title}
                  aria-current={activeDocument?.id === document.id ? "page" : undefined}
                  title={document.title}
                >
                  <span className="sidebar-document-meta">
                    <Folder className="size-3.5" aria-hidden="true" />
                    <span className="sidebar-document-project">
                      {projectsById.get(document.projectId)?.name}
                    </span>
                    {document.starred && (
                      <Star className="size-3 fill-current" aria-label="Starred" />
                    )}
                    <time
                      dateTime={document.updatedAt}
                      title={`Updated ${formatTimestamp(document.updatedAt)}`}
                    >
                      {formatRelativeDate(document.updatedAt, now)}
                    </time>
                  </span>
                  <span className="sidebar-document-title content-title-sm">{document.title}</span>
                </SidebarDocumentLink>
              ))}
            </div>
            {!documents.length && (
              <p className="sidebar-empty">
                {scope.collection === "/starred"
                  ? "No starred documents"
                  : scope.collection === "/archive"
                    ? "No archived documents"
                    : "No documents yet"}
              </p>
            )}
            {documents.length > visibleCount && (
              <Button
                variant="navigation"
                size="sm"
                onClick={() => setScope((current) => ({ ...current, limit: visibleCount + 40 }))}
              >
                Show older documents
              </Button>
            )}
          </SidebarContent>
          <SidebarFooter>
            {signOutError && (
              <p role="alert" className="error-text sidebar-footer-error">
                {signOutError}
              </p>
            )}
            <div className="sidebar-footer-actions">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ButtonLink
                      href="/settings/appearance"
                      variant="navigation"
                      className="w-auto justify-center"
                      size="icon"
                      aria-label="Settings"
                      aria-current={pathname.startsWith("/settings") ? "page" : undefined}
                      onNavigate={close}
                    />
                  }
                >
                  <Settings aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
              <SidebarAction
                label="Connect an agent"
                shortcut={formatBinding(bindings.agents)}
                onClick={settings}
              >
                <Code2 />
              </SidebarAction>
              <SidebarAction
                label="Keyboard shortcuts"
                shortcut={formatBinding(bindings.shortcuts)}
                onClick={keyboardSettings}
              >
                <Keyboard />
              </SidebarAction>
              <SidebarAction
                label={signingOut ? "Signing out…" : "Sign out"}
                aria-description={`Signed in as ${name}`}
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
                <LogOut />
              </SidebarAction>
            </div>
          </SidebarFooter>
        </>
      )}
    </Sidebar>
  );
}
