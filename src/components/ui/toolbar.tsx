import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Layout only: controls keep their shared dimensions and native keyboard behavior.
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)} {...props} />;
}
