import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Form({ className, ...props }: ComponentProps<"form">) {
  return <form className={cn("flex flex-col gap-5", className)} {...props} />;
}

export function FieldGroup({
  columns = 2,
  className,
  ...props
}: ComponentProps<"div"> & { columns?: 2 | 3 }) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "grid min-w-0 gap-5",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}
