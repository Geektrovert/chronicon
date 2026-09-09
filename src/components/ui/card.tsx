// Adapted from shadcn/ui Base UI Card and Nova style (MIT). See THIRD_PARTY_NOTICES.md.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("grid auto-rows-min items-start gap-1 px-4", className)}
      {...props}
    />
  );
}
export function CardTitle({ className, children, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-base font-medium leading-snug", className)}
      {...props}
    >
      {children}
    </h3>
  );
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center border-t bg-muted/50 p-4", className)}
      {...props}
    />
  );
}
