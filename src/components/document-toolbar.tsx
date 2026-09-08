"use client";

import type { ComponentProps, ReactNode } from "react";
import { Archive, Folder, MoreHorizontal, Pencil, RotateCcw, Star } from "lucide-react";
import type { Document, Project } from "@/lib/model";
import { Breadcrumb } from "./ui/breadcrumb";
import { Button } from "./ui/button";
import { Toolbar } from "./ui/toolbar";
import { NavigationLink } from "./ui/navigation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { ViewModeControl } from "./ui/view-mode-control";
import { useWorkspace } from "./workspace";

export function DocumentToolbar({
  document,
  project,
  author,
  edit,
  view,
  revision,
  loading = false,
  actions,
}: {
  document: Document;
  project: Project;
  author?: string;
  edit?: () => void;
  view?: Pick<ComponentProps<typeof ViewModeControl>, "source" | "onSourceChange">;
  revision?: {
    value: string;
    options: { value: string; label: string }[];
    onValueChange: (value: string) => void;
  };
  loading?: boolean;
  actions?: ReactNode;
}) {
  const { updateDocument, pendingDocuments } = useWorkspace();
  const pending = pendingDocuments.includes(document.id);
  return (
    <TooltipProvider delay={400}>
      <Toolbar className="document-toolbar">
        <div className="document-identity">
          <Breadcrumb
            parent={{ href: `/projects/${project.slug}`, label: project.name }}
            title={document.title}
          />
          {author && (
            <span className="document-author" title={`Published by ${author}`}>
              <span aria-hidden="true" className="text-muted-foreground">
                .
              </span>
              <span className="truncate">
                <span className="sr-only">Published by </span>
                {author}
              </span>
            </span>
          )}
        </div>
        <div className="document-view-controls">
          <Select
            items={revision?.options}
            value={revision?.value ?? String(document.revision)}
            disabled={!revision || loading}
            onValueChange={(value) => {
              if (typeof value === "string") revision?.onValueChange(value);
            }}
          >
            <SelectTrigger
              variant="toolbar"
              aria-label={`Choose revision, v${revision?.value ?? document.revision}${Number(revision?.value ?? document.revision) === document.revision ? ", latest" : ", historical"}`}
              title="Choose revision"
            >
              <SelectValue>v{revision?.value ?? document.revision}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false} className="w-auto min-w-56">
              {revision?.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ViewModeControl
            source={view?.source ?? false}
            disabled={!view}
            onSourceChange={(source) => view?.onSourceChange(source)}
          />
        </div>
        <div className="document-actions">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="document-edit"
                  aria-label="Edit document"
                  disabled={!edit || pending}
                  onClick={edit}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Edit document</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="document-star"
                  aria-label={document.starred ? "Unstar document" : "Star document"}
                  aria-pressed={document.starred}
                  disabled={pending}
                  onClick={() => updateDocument(document, { starred: !document.starred })}
                >
                  <Star aria-hidden="true" fill={document.starred ? "currentColor" : "none"} />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {document.starred ? "Unstar document" : "Star document"}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Document actions"
                  title="Document actions"
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="content-title block text-foreground">{document.title}</span>
                  <span className="mt-1 block break-words">
                    {project.name}
                    {author && ` . ${author}`}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem disabled={!edit || pending} onClick={edit}>
                  <Pencil aria-hidden="true" /> Edit document
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={pending}
                  onClick={() => updateDocument(document, { starred: !document.starred })}
                >
                  <Star aria-hidden="true" fill={document.starred ? "currentColor" : "none"} />
                  {document.starred ? "Unstar document" : "Star document"}
                </DropdownMenuItem>
                {actions}
                <DropdownMenuItem render={<NavigationLink href={`/projects/${project.slug}`} />}>
                  <Folder aria-hidden="true" /> Open project
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={pending}
                onClick={() => updateDocument(document, { archived: !document.archived })}
              >
                {document.archived ? (
                  <RotateCcw aria-hidden="true" />
                ) : (
                  <Archive aria-hidden="true" />
                )}
                {document.archived ? "Restore document" : "Archive document"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>
    </TooltipProvider>
  );
}
