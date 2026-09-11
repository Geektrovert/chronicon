"use client";

import { useEffect } from "react";
import { captureError } from "@/client/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { boundary: "root", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Unable to open Chronicon</h1>
          <p>Check your connection and try again.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
