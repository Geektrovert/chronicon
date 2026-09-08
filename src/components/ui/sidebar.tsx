"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button, ButtonLink } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { cn } from "@/lib/utils";
import "./sidebar.css";

export function Sidebar({
  collapsed,
  mobileOpen,
  onMobileOpenChange,
  children,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  children: (state: { compact: boolean; mobile: boolean }) => ReactNode;
}) {
  return (
    <TooltipProvider delay={400}>
      <aside
        className="workspace-sidebar desktop-sidebar"
        data-collapsed={collapsed}
        aria-label="Workspace navigation"
      >
        {children({ compact: collapsed, mobile: false })}
      </aside>
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent
          placement="left"
          className="workspace-sidebar mobile-sidebar"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">Browse projects and documents.</DialogDescription>
          {children({ compact: false, mobile: true })}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("sidebar-header", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav data-slot="sidebar-content" className={cn("sidebar-content", className)} {...props} />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("sidebar-footer", className)} {...props} />;
}

export function SidebarAction({
  label,
  shortcut,
  className,
  ...props
}: ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn("sidebar-action", className)}
            {...props}
          />
        }
      />
      <TooltipContent>
        {label}
        {shortcut && shortcut !== "Disabled" && <span className="ms-3 opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarDocumentLink({ className, ...props }: ComponentProps<typeof ButtonLink>) {
  return (
    <ButtonLink variant="navigation" className={cn("sidebar-document", className)} {...props} />
  );
}
