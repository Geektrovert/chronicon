// Adapted from shadcn/ui registry/config.ts (MIT); see THIRD_PARTY_NOTICES.md.
import { BASE_COLORS, type DesignSettings } from "./model";
import { THEMES } from "./themes";

export const SOURCE_REVISION = "3ba91b1cc83e1bbe4ab35a422ff2a694849c5048";
export const SOURCE_URL = `https://github.com/shadcn-ui/ui/tree/${SOURCE_REVISION}`;
export const RADII = [
  { name: "default", label: "Default", value: "" },
  { name: "none", label: "None", value: "0" },
  { name: "small", label: "Small", value: "0.45rem" },
  { name: "medium", label: "Medium", value: "0.625rem" },
  { name: "large", label: "Large", value: "0.875rem" },
] as const;
export const FONTS = {
  sans: { label: "System sans", value: "ui-sans-serif, system-ui, sans-serif" },
  serif: { label: "System serif", value: "ui-serif, Georgia, serif" },
  mono: { label: "System mono", value: "ui-monospace, SFMono-Regular, Consolas, monospace" },
};
export const baseColors = THEMES.filter((theme) => BASE_COLORS.some((name) => name === theme.name));
export function getThemesForBaseColor(baseColor: string) {
  return THEMES.filter(
    (theme) => theme.name === baseColor || !BASE_COLORS.some((name) => name === theme.name),
  );
}
export function changeBaseColor(
  settings: DesignSettings,
  baseColor: DesignSettings["baseColor"],
): DesignSettings {
  return {
    ...settings,
    baseColor,
    theme: BASE_COLORS.some((name) => name === settings.theme) ? baseColor : settings.theme,
  };
}
export function buildTokens(config: DesignSettings) {
  const baseColor = THEMES.find((theme) => theme.name === config.baseColor);
  const theme = THEMES.find((theme) => theme.name === config.theme);
  const chart = THEMES.find((theme) => theme.name === config.chartColor);
  // Settings are validated at every transport boundary, and pickers use this catalog.
  if (!baseColor || !theme || !chart) throw new Error("Unknown design palette.");
  const light = { ...baseColor.cssVars.light, ...theme.cssVars.light };
  const dark = { ...baseColor.cssVars.dark, ...theme.cssVars.dark };
  for (let i = 1; i <= 5; i++) {
    const key = `chart-${i}`;
    if (chart.cssVars.light[key]) light[key] = chart.cssVars.light[key];
    if (chart.cssVars.dark[key]) dark[key] = chart.cssVars.dark[key];
  }
  if (config.menuAccent === "bold") {
    light.accent = light.primary;
    light["accent-foreground"] = light["primary-foreground"];
    dark.accent = dark.primary;
    dark["accent-foreground"] = dark["primary-foreground"];
  }
  const radius = RADII.find((radius) => radius.name === config.radius);
  light.radius = radius?.value || light.radius || "0.625rem";
  dark.radius = light.radius;
  light["font-sans"] = dark["font-sans"] = FONTS[config.font].value;
  return { light, dark };
}
