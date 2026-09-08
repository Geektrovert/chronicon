import { NavigationLink } from "./navigation-link";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({
  parent,
  title,
}: {
  parent: { href: string; label: string };
  title: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-2 text-xs">
        <li className="breadcrumb-parent min-w-0 shrink-0">
          <NavigationLink
            className="block truncate rounded-md text-muted-foreground hover:text-foreground"
            href={parent.href}
            title={parent.label}
          >
            {parent.label}
          </NavigationLink>
        </li>
        <li role="presentation" aria-hidden="true" className="shrink-0">
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </li>
        <li className="min-w-0" aria-current="page">
          <h1 className="content-title truncate" title={title}>
            {title}
          </h1>
        </li>
      </ol>
    </nav>
  );
}
