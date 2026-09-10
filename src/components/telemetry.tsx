"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { capture, identifyUser } from "@/client/telemetry";

// This component has no server output. Keep its pathname subscription in the
// browser so analytics does not create a dynamic hole in every route's shell.
export const TelemetryNavigation = dynamic(() => import("./telemetry-navigation"), {
  ssr: false,
});

export function TelemetryIdentity({ userId }: { userId: string }) {
  useEffect(() => {
    identifyUser(userId);
    capture("workspace_opened");
  }, [userId]);
  return null;
}
