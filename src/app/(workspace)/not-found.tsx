import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="library-main">
      <EmptyState title="Page not found" description="This project or document is unavailable.">
        <ButtonLink variant="outline" href="/">
          All documents
        </ButtonLink>
      </EmptyState>
    </main>
  );
}
