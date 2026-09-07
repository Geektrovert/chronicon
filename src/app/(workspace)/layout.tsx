import { Suspense } from "react";
import { AuthenticatedWorkspace } from "@/components/authenticated-workspace";
import { LoadingState } from "@/components/ui/loading-state";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<LoadingState>Opening workspace…</LoadingState>}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
