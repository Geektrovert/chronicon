import { Suspense } from "react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<main className="p-8 text-muted-foreground">Opening shared content...</main>}
    >
      {children}
    </Suspense>
  );
}
