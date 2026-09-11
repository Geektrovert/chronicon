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
    <header className="page-heading">
      <div className="min-w-0 flex-1 basis-56">
        {context && <p className="page-context">{context}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
