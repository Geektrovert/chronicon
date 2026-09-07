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
        <div
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground"
        >
          {icon}
        </div>
      )}
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
