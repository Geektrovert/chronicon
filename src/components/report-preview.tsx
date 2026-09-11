"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { revealPreviewFragment, watchPreviewNavigation } from "@/client/actions/preview";
import { useTask } from "@/client/runtime";
import { previewHTML } from "@/lib/preview";
import { capture } from "@/client/telemetry";

export function ReportPreview({
  html,
  title,
  onNavigate,
}: {
  html: string;
  title: string;
  onNavigate?: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const run = useTask();
  useEffect(() => {
    if (!frame.current) return;

    return run(
      watchPreviewNavigation(frame.current, (href) => {
        capture("document_preview_navigation");
        const url = new URL(href, window.location.origin);

        if (url.pathname === window.location.pathname && frame.current)
          run(revealPreviewFragment(frame.current, url.hash));
        onNavigate?.();
        startTransition(() => router.push(href));
      }),
    );
  }, [onNavigate, router, run]);

  // Keep explicit inheritance out of CSS processing, which normalizes it to "normal".
  return (
    <iframe
      ref={frame}
      title={title}
      style={{ colorScheme: "inherit" }}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={previewHTML(html)}
      onLoad={() => {
        if (frame.current) run(revealPreviewFragment(frame.current, window.location.hash));
      }}
    />
  );
}
