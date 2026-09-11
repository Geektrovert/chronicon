"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePage } from "@/client/telemetry";

export default function TelemetryNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    capturePage(pathname);
  }, [pathname]);

  return null;
}
