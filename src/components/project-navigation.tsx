"use client";

import { FileText, Menu, Palette } from "lucide-react";
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
      <Button
        variant="outline"
        size="icon"
        className="mobile-menu"
        aria-label="Open navigation"
        onClick={openNavigation}
      >
        <Menu />
      </Button>
      <nav className="project-sections segmented-control" aria-label={`${project.name} navigation`}>
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
              aria-current={exact ? "page" : within ? "location" : undefined}
            >
              <section.icon aria-hidden="true" />
              {section.label}
            </ButtonLink>
          );
        })}
      </nav>
      <SharingButton type="project" id={project.id} name={project.name} />
    </header>
  );
}
