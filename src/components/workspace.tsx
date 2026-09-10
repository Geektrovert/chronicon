"use client";
import { KeyboardSettings } from "./keyboard-settings";
import { bindingFromEvent, defaultBindings, shortcutActions } from "@/lib/keybindings";
import { loadKeybindings } from "@/client/actions/keybindings";
import {
  defaultSidebarLayout,
  loadSidebarLayout,
  saveSidebarLayout,
  sidebarSizes,
  watchSidebarViewport,
  type SidebarLayout,
} from "@/client/actions/sidebar";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
  startTransition,
  type ReactNode,
} from "react";
import { Result } from "effect";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FileText, Folder, Folders, Menu } from "lucide-react";
import type { Document, Library } from "@/lib/model";
import { runAction, useTask } from "@/client/runtime";
import { loadLibrary, loadProjectLibrary, updateReport } from "@/client/actions/library";
import { watchLibrary } from "@/client/actions/watch-library";
import { watchSessionEnd } from "@/client/actions/session";
import { useSearch } from "@/lib/use-search";
import { Button } from "./ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { CreateProject } from "./create-project";
import { Publisher } from "./publisher";
import { AgentSettings } from "./agent-settings";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { SidebarFrame } from "./ui/sidebar";
import { ProjectNavigation, projectSections, projectSectionHref } from "./project-navigation";
import { DesignDraftsProvider } from "./project-design/drafts";
import "./project-navigation.css";

const noPendingDocuments: ReadonlyArray<string> = [];

// A full snapshot can revoke access. Never retain resources absent from it.
// Keep newer content confirmations only for resources still present, using the
// snapshot's current permissions even when its content revision is older.
function reconcileLibrary(current: Library, incoming: Library): Library {
  const previous = new Map(current.documents.map((document) => [document.id, document]));
  return {
    projects: incoming.projects,
    documents: incoming.documents.map((document) => {
      const newer = previous.get(document.id);
      return newer && newer.updatedAt > document.updatedAt
        ? { ...newer, accessRole: document.accessRole, visibility: document.visibility }
        : document;
    }),
  };
}

function mergeDocuments(current: Library, incoming: ReadonlyArray<Document>): Library {
  const documents = new Map(current.documents.map((document) => [document.id, document]));
  for (const document of incoming) {
    const previous = documents.get(document.id);
    if (!previous || document.updatedAt >= previous.updatedAt) documents.set(document.id, document);
  }
  return {
    projects: current.projects,
    documents: [...documents.values()],
  };
}

const WorkspaceContext = createContext<{
  library: Library;
  setProjectScope: (library: Library) => void;
  query: string;
  setQuery: (query: string) => void;
  search: ReturnType<typeof useSearch>;
  error: string;
  refresh: () => void;
  publish: () => void;
  createProject: () => void;
  documentChanged: (document: Document) => void;
  updateDocument: (
    document: Document,
    patch: Partial<Pick<Document, "starred" | "archived">>,
  ) => void;
  pendingDocuments: ReadonlyArray<string>;
  refreshing: boolean;
} | null>(null);

export function useWorkspace() {
  const workspace = use(WorkspaceContext);
  if (!workspace) throw new Error("Workspace content requires the workspace layout.");
  return workspace;
}

export function Workspace({
  initialLibrary,
  name,
  children,
}: {
  initialLibrary: Library;
  name: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ slug?: string; id?: string }>();
  const run = useTask();
  const [confirmedLibrary, setLibrary] = useState(initialLibrary);
  const [projectScope, setProjectScope] = useState<Library | null>(null);
  const scopeProject = projectScope?.projects[0];
  const scopeActive =
    !!scopeProject &&
    (params.slug === scopeProject.id ||
      params.slug === scopeProject.slug ||
      (!!params.id && !!projectScope?.documents.some((document) => document.id === params.id)));
  const scopeId = scopeActive ? scopeProject?.id : undefined;
  const visibleLibrary =
    scopeActive && projectScope
      ? {
          projects: [
            ...confirmedLibrary.projects.filter((project) => project.id !== scopeId),
            ...projectScope.projects,
          ],
          documents: [
            ...confirmedLibrary.documents.filter((document) => document.projectId !== scopeId),
            ...projectScope.documents,
          ],
        }
      : confirmedLibrary;
  const [optimistic, updateOptimistic] = useOptimistic(
    { library: visibleLibrary, pendingDocuments: noPendingDocuments },
    (current, document: Document) => ({
      library: {
        ...current.library,
        documents: current.library.documents.map((item) =>
          item.id === document.id ? document : item,
        ),
      },
      pendingDocuments: [...current.pendingDocuments, document.id],
    }),
  );
  const { library } = optimistic;
  const [, startUpdate] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [previousLibrary, setPreviousLibrary] = useState(initialLibrary);
  if (initialLibrary !== previousLibrary) {
    setPreviousLibrary(initialLibrary);
    setLibrary((current) => reconcileLibrary(current, initialLibrary));
  }
  const projectId = params.slug
    ? (
        library.projects.find((project) => project.id === params.slug) ??
        library.projects.find((project) => project.slug === params.slug)
      )?.id
    : library.documents.find((document) => document.id === params.id)?.projectId;
  const [searchInput, setSearchInput] = useState({ pathname, query: "" });
  const query = searchInput.pathname === pathname ? searchInput.query : "";
  function setQuery(query: string) {
    setSearchInput({ pathname, query });
  }
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandGlobal, setCommandGlobal] = useState(true);
  const [projectOpen, setProjectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [bindings, setBindings] = useState(defaultBindings);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarLayout, setSidebarLayout] = useState(defaultSidebarLayout);
  const [maximumSidebarWidth, setMaximumSidebarWidth] = useState(sidebarSizes.max);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [error, setError] = useState("");
  const search = useSearch(
    optimistic.library,
    query,
    commandOpen && commandGlobal ? undefined : projectId,
  );
  const { ids: resultIds, ready: searchReady, error: searchError, retry: retrySearch } = search;
  const project = library.projects.find((p) => p.id === projectId);
  const writableProjects = library.projects.filter(
    (item) => item.accessRole === "edit" || item.accessRole === "full_access",
  );
  function refresh() {
    setError("");
    startRefresh(() =>
      runAction(scopeId ? loadProjectLibrary(scopeId) : loadLibrary).then((result) => {
        startTransition(() => {
          if (Result.isSuccess(result)) {
            if (scopeId)
              setProjectScope((current) =>
                current?.projects[0]?.id === scopeId
                  ? reconcileLibrary(current, result.success)
                  : current,
              );
            else setLibrary((current) => reconcileLibrary(current, result.success));
          } else setError(result.failure);
        });
      }),
    );
  }
  function publish() {
    if (writableProjects.length) setPublishOpen(true);
    else setProjectOpen(true);
  }
  const commitSidebarLayout = useCallback(
    (layout: SidebarLayout) => {
      setSidebarLayout(layout);
      run(saveSidebarLayout(layout), { onError: setError });
    },
    [run],
  );
  function toggleSidebar() {
    if (mobileViewport) {
      setMobileOpen((open) => !open);
      return;
    }
    commitSidebarLayout({ ...sidebarLayout, collapsed: !sidebarLayout.collapsed });
  }
  const documentChanged = useCallback((document: Document) => {
    setLibrary((current) =>
      current.projects.some((project) => project.id === document.projectId) ||
      current.documents.some((item) => item.id === document.id)
        ? mergeDocuments(current, [document])
        : current,
    );
    setProjectScope((current) =>
      current?.projects[0]?.id === document.projectId
        ? mergeDocuments(current, [document])
        : current,
    );
  }, []);
  function updateDocument(
    document: Document,
    patch: Partial<Pick<Document, "starred" | "archived">>,
  ) {
    if (optimistic.pendingDocuments.includes(document.id)) return;
    setError("");
    startUpdate(() => {
      updateOptimistic({ ...document, ...patch });
      return runAction(updateReport(document.id, patch)).then((result) => {
        startTransition(() => {
          if (Result.isSuccess(result)) documentChanged(result.success);
          else setError(result.failure);
        });
      });
    });
  }
  useEffect(() => run(loadKeybindings, { onSuccess: setBindings, onError: setError }), [run]);
  useEffect(() => run(loadSidebarLayout, { onSuccess: setSidebarLayout }), [run]);
  useEffect(
    () =>
      run(
        watchSidebarViewport((mobile, maximumWidth) => {
          setMobileViewport(mobile);
          setMaximumSidebarWidth(maximumWidth);
          if (!mobile) setMobileOpen(false);
        }),
      ),
    [run],
  );
  useEffect(() => run(watchSessionEnd), [run]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=combobox], [role=textbox]",
        )
      )
        return;
      const binding = bindingFromEvent(event);
      const action = shortcutActions.find(
        (item) => bindings[item.id] && bindings[item.id] === binding,
      )?.id;
      if (!action) return;
      if (
        document.querySelector('[role="dialog"], [role="alertdialog"]') &&
        !(action === "sidebar" && mobileOpen)
      )
        return;
      event.preventDefault();
      if (action !== "sidebar") setMobileOpen(false);
      switch (action) {
        case "search":
        case "projectSearch":
          setCommandGlobal(action === "search" || !projectId);
          setQuery("");
          setCommandOpen(true);
          break;
        case "document":
          publish();
          break;
        case "project":
          setProjectOpen(true);
          break;
        case "agents":
          setSettingsOpen(true);
          break;
        case "shortcuts":
          setKeyboardOpen(true);
          break;
        case "library":
          router.push("/");
          break;
        case "starred":
          router.push("/starred");
          break;
        case "archive":
          router.push("/archive");
          break;
        case "refresh":
          refresh();
          break;
        case "sidebar":
          toggleSidebar();
          break;
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  useEffect(
    () =>
      run(
        watchLibrary((incoming) => {
          startTransition(() => {
            if (scopeId)
              setProjectScope((current) =>
                current?.projects[0]?.id === scopeId
                  ? reconcileLibrary(current, incoming)
                  : current,
              );
            else setLibrary((current) => reconcileLibrary(current, incoming));
          });
        }, scopeId),
      ),
    [run, scopeId],
  );
  const documentsById = new Map(library.documents.map((d) => [d.id, d]));
  const commandResults = query.trim()
    ? resultIds.map((id) => documentsById.get(id)).filter((d): d is Document => !!d && !d.archived)
    : library.documents.filter(
        (d) => !d.archived && (commandGlobal || !projectId || d.projectId === projectId),
      );
  function openSearch() {
    setMobileOpen(false);
    setCommandGlobal(true);
    setQuery("");
    setCommandOpen(true);
  }
  function navigate(href: string) {
    setCommandOpen(false);
    setQuery("");
    router.push(href);
  }
  const navigationItems = [
    { href: "/projects", label: "Projects", description: "Browse projects", icon: Folders },
    ...(project
      ? projectSections.map((section) => ({
          href: projectSectionHref(project, section),
          label: section.label,
          description: project.name,
          icon: section.icon,
        }))
      : []),
  ].filter((item) =>
    `${item.label} ${item.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const matchingProjects = commandGlobal
    ? library.projects.filter(
        (item) =>
          item.id !== projectId &&
          `${item.name} ${item.slug}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      )
    : [];
  return (
    <DesignDraftsProvider>
      <WorkspaceContext
        value={{
          library: optimistic.library,
          setProjectScope,
          query: commandOpen ? "" : query,
          setQuery,
          search,
          error,
          refresh,
          publish,
          createProject: () => setProjectOpen(true),
          documentChanged,
          updateDocument,
          pendingDocuments: optimistic.pendingDocuments,
          refreshing,
        }}
      >
        <SidebarFrame layout={sidebarLayout}>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <WorkspaceSidebar
            bindings={bindings}
            keyboardSettings={() => {
              setMobileOpen(false);
              setKeyboardOpen(true);
            }}
            library={optimistic.library}
            name={name}
            pathname={pathname}
            layout={sidebarLayout}
            maximumWidth={maximumSidebarWidth}
            resize={setSidebarLayout}
            resizeEnd={commitSidebarLayout}
            toggleCollapsed={toggleSidebar}
            mobileOpen={mobileOpen}
            createProject={() => {
              setMobileOpen(false);
              setProjectOpen(true);
            }}
            search={openSearch}
            publish={() => {
              setMobileOpen(false);
              publish();
            }}
            settings={() => {
              setMobileOpen(false);
              setSettingsOpen(true);
            }}
            close={() => setMobileOpen(false)}
          />
          <div className={project ? "workspace-body project-workspace" : "workspace-body"}>
            {project ? (
              <ProjectNavigation
                project={project}
                pathname={pathname}
                openNavigation={() => setMobileOpen(true)}
              />
            ) : (
              <header className="topbar">
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open navigation"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu size={19} />
                </Button>
              </header>
            )}
            {children}
          </div>
          <CommandDialog
            open={commandOpen}
            onOpenChange={(open) => {
              setCommandOpen(open);
              if (!open) setQuery("");
            }}
            title={commandGlobal ? "Search workspace" : "Search project"}
            description="Find documents, projects, and design systems."
          >
            <Command shouldFilter={false}>
              <CommandInput
                aria-label={commandGlobal ? "Search workspace" : "Search project"}
                placeholder={
                  commandGlobal
                    ? "Search documents and projects…"
                    : `Search ${project?.name || "this project"}…`
                }
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty className="space-y-2 px-4">
                  {searchError ? (
                    <>
                      <p className="break-words">{searchError}</p>
                      <Button variant="ghost" onClick={retrySearch}>
                        Try again
                      </Button>
                    </>
                  ) : searchReady ? (
                    <>
                      <p className="break-words">No results for "{query.trim()}".</p>
                      <Button variant="ghost" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    </>
                  ) : (
                    "Preparing search…"
                  )}
                </CommandEmpty>
                {navigationItems.length > 0 && (
                  <CommandGroup heading="Navigation">
                    {navigationItems.map((item) => (
                      <CommandItem
                        key={item.href}
                        value={`navigate:${item.href}`}
                        onSelect={() => navigate(item.href)}
                      >
                        <item.icon size={17} />
                        <span className="flex-1">{item.label}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {matchingProjects.length > 0 && (
                  <CommandGroup heading="Projects">
                    {matchingProjects.slice(0, 8).map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`project:${item.id}`}
                        onSelect={() => navigate(`/projects/${item.id}`)}
                      >
                        <Folder size={17} />
                        <span className="truncate">{item.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {commandResults.length > 0 && (
                  <CommandGroup heading={query ? "Documents" : "Recently updated"}>
                    {commandResults.slice(0, 30).map((doc) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.id}
                        onSelect={() => navigate(`/documents/${doc.id}`)}
                      >
                        <FileText size={17} />
                        <span className="min-w-0 flex-1">
                          <span className="content-title">{doc.title}</span>
                          <small className="block text-muted-foreground">
                            {library.projects.find((p) => p.id === doc.projectId)?.name ??
                              "Shared document"}
                          </small>
                        </span>
                        <span className="text-xs text-muted-foreground">v{doc.revision}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
            <div className="command-footer">
              <span>↑ ↓ Navigate</span>
              <span>↵ Open</span>
              {projectId && (
                <Button variant="ghost" size="sm" onClick={() => setCommandGlobal(!commandGlobal)}>
                  {commandGlobal ? "Search this project" : "Search everywhere"}
                </Button>
              )}
            </div>
          </CommandDialog>
          <CreateProject
            open={projectOpen}
            onOpenChange={setProjectOpen}
            onCreated={(p) => {
              setLibrary((old) => ({
                ...old,
                projects: old.projects.some((item) => item.id === p.id)
                  ? old.projects
                  : [...old.projects, p],
              }));
              router.push(`/projects/${p.id}`);
            }}
          />
          <Publisher
            key={projectId || "all-projects"}
            open={publishOpen}
            onOpenChange={setPublishOpen}
            projects={writableProjects}
            projectId={projectId}
            onPublished={(document) => {
              documentChanged(document);
              router.push(`/documents/${document.id}`);
            }}
          />
          {keyboardOpen && (
            <KeyboardSettings
              bindings={bindings}
              onSaved={setBindings}
              onClose={() => setKeyboardOpen(false)}
            />
          )}
          <AgentSettings
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            projects={library.projects}
          />
        </SidebarFrame>
      </WorkspaceContext>
    </DesignDraftsProvider>
  );
}
