"use client";

import { ChevronRight, FileText, Menu, Palette } from "lucide-react";
import type { Project } from "@/lib/model";
import { Button, ButtonLink } from "./ui/button";
import { SharingButton } from "./sharing-dialog";

// Project destinations share labels and routes across the header, directory,
// and command search. Add future project features here with their own route.
export const projectSections = [
  { id: "documents", label: "Documents", path: "", icon: FileText },
  { id: "design", label: "Design system", path: "/design", icon: Palette },
] as const;

export function projectSectionHref(project: Project, section: (typeof projectSections)[number]) {
  return `/projects/${project.id}${section.path}`;
}

export function ProjectNavigation({
  project,
  pathname,
  openNavigation,
}: {
  project: Project;
  pathname: string;
  openNavigation: () => void;
}) {
  return (
    <header className="project-header">
      <div className="project-identity">
        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu"
          aria-label="Open navigation"
          onClick={openNavigation}
        >
          <Menu />
        </Button>
        <ButtonLink href="/projects" variant="link" size="sm" className="project-directory-link">
          Projects
        </ButtonLink>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="project-name" title={project.name}>
          {project.name}
        </span>
        <div className="ml-auto">
          <SharingButton type="project" id={project.id} name={project.name} />
        </div>
      </div>
      <nav className="project-sections" aria-label={`${project.name} navigation`}>
        {projectSections.map((section) => {
          const href = projectSectionHref(project, section);
          const legacyHref = `/projects/${project.slug}${section.path}`;
          const exact = pathname === href || pathname === legacyHref;
          const within = section.path
            ? pathname.startsWith(`${href}/`) || pathname.startsWith(`${legacyHref}/`)
            : pathname.startsWith("/documents/");
          return (
            <ButtonLink
              key={section.id}
              href={href}
              variant="navigation"
              className="project-section-link"
              aria-current={exact ? "page" : within ? "location" : undefined}
            >
              <section.icon aria-hidden="true" />
              {section.label}
            </ButtonLink>
          );
        })}
      </nav>
    </header>
  );
}
