import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  context,
  actions,
}: {
  title: string;
  description?: string;
  context?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-56">
        {context && <p className="mb-2 text-sm text-muted-foreground">{context}</p>}
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
