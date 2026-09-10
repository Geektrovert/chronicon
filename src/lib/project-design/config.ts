// Adapted from shadcn/ui registry/config.ts (MIT); see THIRD_PARTY_NOTICES.md.
import { BASE_COLORS, type DesignSettings } from "./model";
import { THEMES } from "./themes";
import { FONT_DEFINITIONS } from "./fonts";

export const SOURCE_REVISION = "3ba91b1cc83e1bbe4ab35a422ff2a694849c5048";
export const SOURCE_URL = `https://github.com/shadcn-ui/ui/tree/${SOURCE_REVISION}`;
export const RADII = [
  { name: "default", label: "Default", value: "" },
  { name: "none", label: "None", value: "0" },
  { name: "small", label: "Small", value: "0.45rem" },
  { name: "medium", label: "Medium", value: "0.625rem" },
  { name: "large", label: "Large", value: "0.875rem" },
] as const;
const SYSTEM_FONTS = {
  sans: { label: "System sans", value: "ui-sans-serif, system-ui, sans-serif" },
  serif: { label: "System serif", value: "ui-serif, Georgia, serif" },
  mono: { label: "System mono", value: "ui-monospace, SFMono-Regular, Consolas, monospace" },
};
export const STYLES = [
  { value: "vega", label: "Vega", description: "Clean, neutral, and familiar" },
  { value: "nova", label: "Nova", description: "Reduced padding and margins" },
  { value: "maia", label: "Maia", description: "Rounded, with generous spacing" },
  { value: "lyra", label: "Lyra", description: "Boxy and sharp. For mono fonts" },
  { value: "mira", label: "Mira", description: "Made for compact interfaces" },
  { value: "luma", label: "Luma", description: "Fluid, luminous, and soft" },
  { value: "sera", label: "Sera", description: "Editorial and typographic" },
  { value: "rhea", label: "Rhea", description: "Like Luma but compact" },
] as const;
export const FONT_OPTIONS = [
  ...FONT_DEFINITIONS.map((font) => ({
    value: font.name,
    label: font.title,
    fontFamily: font.family,
  })),
  ...(["sans", "serif", "mono"] as const).map((name) => ({
    value: name,
    label: SYSTEM_FONTS[name].label,
    fontFamily: SYSTEM_FONTS[name].value,
  })),
];
export function fontFamily(font: DesignSettings["font"]) {
  return FONT_OPTIONS.find((option) => option.value === font)!.fontFamily;
}
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
  const baseColor = THEMES.find((theme) => theme.name === config.baseColor)!;
  const theme = THEMES.find((theme) => theme.name === config.theme)!;
  const chart = THEMES.find((theme) => theme.name === config.chartColor)!;
  const light = { ...baseColor.cssVars.light, ...theme.cssVars.light };
  const dark = { ...baseColor.cssVars.dark, ...theme.cssVars.dark };
  for (let i = 1; i <= 5; i++) {
    const key = `chart-${i}`;
    light[key] = chart.cssVars.light[key];
    dark[key] = chart.cssVars.dark[key];
  }
  if (config.menuAccent === "bold") {
    light.accent = light.primary;
    light["accent-foreground"] = light["primary-foreground"];
    dark.accent = dark.primary;
    dark["accent-foreground"] = dark["primary-foreground"];
  }
  const radius = RADII.find((radius) => radius.name === config.radius)!;
  light.radius = radius.value || light.radius;
  dark.radius = light.radius;
  light["font-sans"] = dark["font-sans"] = fontFamily(config.font);
  light["font-heading"] = dark["font-heading"] = fontFamily(
    config.fontHeading === "inherit" ? config.font : config.fontHeading,
  );
  for (const [mode, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const opposite = mode === "light" ? dark : light;
    const source = config.menuColor.startsWith("inverted") ? opposite : tokens;
    tokens["menu-background"] = config.menuColor.endsWith("translucent")
      ? `color-mix(in oklch, ${source.popover} 85%, transparent)`
      : source.popover;
    tokens["menu-foreground"] = source["popover-foreground"];
    tokens["menu-accent"] = source.accent;
    tokens["menu-accent-foreground"] = source["accent-foreground"];
  }
  return { light, dark };
}
