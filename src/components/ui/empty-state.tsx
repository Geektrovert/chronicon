import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      {icon && (
        <div aria-hidden="true" className="empty-state-symbol">
          {icon}
        </div>
      )}
      <div className="space-y-2">
        <h2 className="font-sans text-lg font-semibold tracking-tight">{title}</h2>
        <p className="content-description max-w-prose text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
