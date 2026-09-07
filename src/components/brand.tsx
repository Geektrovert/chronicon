import Link from "next/link";
import { Layers2 } from "lucide-react";

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" className="brand" onNavigate={onNavigate}>
      <span className="brand-mark">
        <Layers2 size={21} aria-hidden="true" />
      </span>
      Chronicon
    </Link>
  );
}
