"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// Next prefetches the shared shell normally. Resolve a specific project/report
// when the user points to or focuses its link, without fetching every HTML file.
export function NavigationLink({
  prefetch,
  onPointerEnter,
  onFocus,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch ?? (intent ? true : undefined)}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
