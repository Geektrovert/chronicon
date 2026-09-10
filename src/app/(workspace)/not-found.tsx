import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="library-main">
      <EmptyState title="Page not found" description="Check the link or browse your documents.">
        <ButtonLink variant="outline" href="/">
          Browse all documents
        </ButtonLink>
      </EmptyState>
    </main>
  );
}
