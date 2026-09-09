import type { CSSProperties } from "react";
import type { ProjectDesign } from "@/lib/project-design/model";
import { NotificationSettings, EmptyConnectBank } from "./templates";
import "./preview.css";

export function DesignPreview({ tokens }: { tokens: ProjectDesign["tokens"] }) {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
      {(["light", "dark"] as const).map((mode) => {
        const variables = Object.fromEntries(
          Object.entries(tokens[mode]).map(([name, value]) => [`--${name}`, value]),
        );
        const style: CSSProperties = {
          ...variables,
          colorScheme: mode,
          fontFamily: tokens[mode]["font-sans"],
        };
        return (
          <section
            key={mode}
            data-design-preview={mode}
            style={style}
            aria-label={`${mode === "light" ? "Light" : "Dark"} component preview`}
            className="min-w-0 rounded-xl border p-4"
          >
            <div className="mb-5 flex items-center justify-between gap-2 text-sm">
              <h2 className="font-semibold capitalize">{mode}</h2>
              <span className="text-xs text-muted-foreground">Example content</span>
            </div>
            <div className="space-y-4">
              <NotificationSettings />
              <EmptyConnectBank />
            </div>
            <div className="mt-5 flex gap-2" aria-label="Menu accent samples">
              <span
                className="rounded-md px-2 py-1 text-sm"
                style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                Overview
              </span>
              <span className="px-2 py-1 text-sm text-muted-foreground">Activity</span>
            </div>
            <figure className="mt-4 flex items-end gap-2" aria-label="Five chart palette colors">
              {[48, 72, 56, 88, 64].map((height, index) => (
                <div
                  key={index}
                  className="min-w-0 flex-1 rounded-t-sm"
                  style={{ height, background: `var(--chart-${index + 1})` }}
                />
              ))}
            </figure>
          </section>
        );
      })}
    </div>
  );
}
