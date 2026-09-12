"use client";

import { useId, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import {
  resizeSidebar,
  sidebarLayoutFromKey,
  sidebarSizes,
  type SidebarLayout,
} from "@/client/actions/sidebar";
import { useTask } from "@/client/runtime";
import { Button, ButtonLink } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { cn } from "@/lib/utils";
import "./sidebar.css";

export function SidebarFrame({ layout, children }: { layout: SidebarLayout; children: ReactNode }) {
  const style: CSSProperties &
    Record<"--sidebar-width" | "--sidebar-rail-width" | "--sidebar-max-width", string> = {
    "--sidebar-width": `${layout.width}px`,
    "--sidebar-rail-width": `${sidebarSizes.rail}px`,
    "--sidebar-max-width": `min(${sidebarSizes.max}px, ${sidebarSizes.viewportFraction * 100}vw)`,
  };

  return (
    <div className="workspace" data-sidebar-collapsed={layout.collapsed} style={style}>
      {children}
    </div>
  );
}

export function Sidebar({
  layout,
  maximumWidth,
  onResize,
  onResizeEnd,
  mobileOpen,
  onMobileOpenChange,
  children,
}: {
  layout: SidebarLayout;
  maximumWidth: number;
  onResize: (layout: SidebarLayout) => void;
  onResizeEnd: (layout: SidebarLayout) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  children: (state: { compact: boolean; mobile: boolean }) => ReactNode;
}) {
  return (
    <TooltipProvider delay={400}>
      <aside
        id="workspace-sidebar"
        className="workspace-sidebar desktop-sidebar"
        data-collapsed={layout.collapsed}
        aria-label="Workspace navigation"
      >
        {children({ compact: layout.collapsed, mobile: false })}
        <SidebarResizeHandle
          layout={layout}
          maximumWidth={maximumWidth}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
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

function SidebarResizeHandle({
  layout,
  maximumWidth,
  onResize,
  onResizeEnd,
}: Pick<ComponentProps<typeof Sidebar>, "layout" | "maximumWidth" | "onResize" | "onResizeEnd">) {
  const run = useTask();
  const descriptionId = useId();
  const width = layout.collapsed ? sidebarSizes.rail : Math.min(layout.width, maximumWidth);

  return (
    <>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A focusable window splitter is an ARIA widget, not a thematic break.
        role="separator"
        tabIndex={0}
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-controls="workspace-sidebar"
        aria-valuemin={sidebarSizes.rail}
        aria-valuemax={Math.round(maximumWidth)}
        aria-valuenow={Math.round(width)}
        aria-valuetext={layout.collapsed ? "Collapsed" : `${Math.round(width)} pixels`}
        aria-describedby={descriptionId}
        className="sidebar-resize-handle"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          run(
            resizeSidebar(event.currentTarget, event.nativeEvent, layout, maximumWidth, onResize),
            {
              onSuccess: onResizeEnd,
              onError: () => onResize(layout),
            },
          );
        }}
        onClick={(event) => {
          // Assistive activation may send a click without pointer events.
          if (event.detail === 0) onResizeEnd({ ...layout, collapsed: !layout.collapsed });
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)
            return;

          const next = sidebarLayoutFromKey(
            event.key,
            layout,
            maximumWidth,
            getComputedStyle(event.currentTarget).direction === "rtl" ? "rtl" : "ltr",
            event.shiftKey,
          );

          if (!next) return;
          event.preventDefault();
          onResizeEnd(next);
        }}
      />
      <span id={descriptionId} className="sr-only">
        Select or press Enter to collapse or expand. Drag or use the left and right arrow keys to
        resize. Press Shift+Home to reset the width.
      </span>
    </>
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
            variant="outline"
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
