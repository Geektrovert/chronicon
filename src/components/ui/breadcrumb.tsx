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
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
        <li className="min-w-0">
          <NavigationLink
            className="rounded-md text-muted-foreground break-words hover:text-foreground"
            href={parent.href}
          >
            {parent.label}
          </NavigationLink>
        </li>
        <li role="presentation" aria-hidden="true">
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </li>
        <li className="min-w-0" aria-current="page">
          <h1 className="text-[13px] font-medium break-words">{title}</h1>
        </li>
      </ol>
    </nav>
  );
}
