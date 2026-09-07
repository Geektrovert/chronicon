import type { ReactNode } from "react";

export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <output className="flex min-h-[60dvh] items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </output>
  );
}
