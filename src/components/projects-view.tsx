"use client";

import { useRef, useState } from "react";
import { Folder, Plus } from "lucide-react";
import { useWorkspace } from "./workspace";
import { projectSections, projectSectionHref } from "./project-navigation";
import { Button, ButtonLink } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { NavigationLink } from "./ui/navigation-link";
import { SearchField } from "./ui/search-field";

export function ProjectsView() {
  const { library, createProject } = useWorkspace();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const phrase = query.trim().toLocaleLowerCase();
  const projects = library.projects
    .filter((project) =>
      `${project.name} ${project.slug} ${project.description}`.toLocaleLowerCase().includes(phrase),
    )
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  for (const document of library.documents) {
    if (!document.archived)
      counts.set(document.projectId, (counts.get(document.projectId) ?? 0) + 1);
  }
  return (
    <main id="main" className="projects-main">
      <header className="page-heading">
        <div>
          <h1>Projects</h1>
          <p>Documents and design systems, organized by project.</p>
        </div>
        <Button onClick={createProject}>
          <Plus />
          Create project
        </Button>
      </header>
      {library.projects.length > 0 && (
        <div className="projects-search">
          <SearchField
            inputRef={searchInput}
            id="project-search"
            label="Search projects"
            placeholder="Search projects…"
            value={query}
            onValueChange={setQuery}
          />
          <output className="text-xs text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </output>
        </div>
      )}
      {projects.length ? (
        <div className="project-directory">
          {projects.map((project) => {
            const count = counts.get(project.id) ?? 0;
            return (
              <article key={project.id} className="project-directory-item">
                <div className="project-directory-identity">
                  <Folder className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <h2>
                      <NavigationLink href={`/projects/${project.id}`}>
                        {project.name}
                      </NavigationLink>
                    </h2>
                    {project.description && (
                      <p className="content-description">{project.description}</p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "document" : "documents"}
                    </span>
                  </div>
                </div>
                <nav className="project-directory-actions" aria-label={`${project.name} features`}>
                  {projectSections.map((section) => (
                    <ButtonLink
                      key={section.id}
                      href={projectSectionHref(project, section)}
                      variant="outline"
                      size="sm"
                      aria-label={`${section.label} for ${project.name}`}
                    >
                      <section.icon aria-hidden="true" />
                      {section.label}
                    </ButtonLink>
                  ))}
                </nav>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Folder />}
          title={phrase ? `No projects match "${query.trim()}"` : "Create your first project"}
          description={
            phrase
              ? "Try another name or clear your search."
              : "Keep related documents and their design system together."
          }
        >
          {phrase && (
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              Clear search
            </Button>
          )}
        </EmptyState>
      )}
    </main>
  );
}
