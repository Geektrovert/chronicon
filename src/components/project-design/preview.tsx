"use client";

import type { CSSProperties } from "react";
import type { DesignSettings, ProjectDesign } from "@/lib/project-design/model";
import { buildTokens, fontFamily } from "@/lib/project-design/config";
import { ComponentGallery } from "./gallery";
import { GalleryContext } from "./gallery-context";
import "./preview.css";
import "./fonts.css";

export type PreviewMode = "light" | "dark" | "both";

export function DesignPreview({
  settings,
  tokens,
  mode,
}: {
  settings: DesignSettings;
  tokens: ProjectDesign["tokens"];
  mode: PreviewMode;
}) {
  const modes = mode === "both" ? (["light", "dark"] as const) : [mode];
  const defaultTokens = buildTokens(settings);

  return (
    <div className="design-preview-panels" data-comparison={mode === "both"}>
      {modes.map((appearance) => {
        const variables = Object.fromEntries(
          Object.entries({ ...defaultTokens[appearance], ...tokens[appearance] }).map(
            ([name, value]) => [`--${name}`, value],
          ),
        );

        const style: CSSProperties = {
          ...variables,
          colorScheme: appearance,
          fontFamily: fontFamily(settings.font),
        };

        return (
          <GalleryContext key={appearance} value={{ settings, mode: appearance, style }}>
            <section
              data-design-preview={appearance}
              data-style={settings.style}
              data-radius={settings.radius}
              data-pointer={settings.pointer}
              style={style}
              dir={settings.rtl ? "rtl" : "ltr"}
              aria-label={`${appearance === "light" ? "Light" : "Dark"} component gallery`}
              className="design-gallery-canvas"
            >
              {mode === "both" && (
                <h2 className="mb-6 text-sm font-medium capitalize">{appearance}</h2>
              )}
              <ComponentGallery />
            </section>
          </GalleryContext>
        );
      })}
    </div>
  );
}
