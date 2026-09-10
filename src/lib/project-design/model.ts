import { Effect, Schema } from "effect";
import { projectReference } from "@/lib/model";
import { FONT_DEFINITIONS } from "./fonts";

export const BASE_COLORS = ["neutral", "stone", "zinc", "mauve", "olive", "mist", "taupe"] as const;
export const ACCENT_COLORS = [
  "amber",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "green",
  "indigo",
  "lime",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "teal",
  "violet",
  "yellow",
] as const;
export const themeName = Schema.Literals([...BASE_COLORS, ...ACCENT_COLORS]);
export const radiusName = Schema.Literals(["default", "none", "small", "medium", "large"]);
export const STYLE_NAMES = [
  "vega",
  "nova",
  "maia",
  "lyra",
  "mira",
  "luma",
  "sera",
  "rhea",
] as const;
export const ICON_LIBRARIES = ["lucide", "tabler", "hugeicons", "phosphor", "remixicon"] as const;
export const MENU_COLORS = [
  "default",
  "inverted",
  "default-translucent",
  "inverted-translucent",
] as const;
export const FONT_NAMES = [
  ...FONT_DEFINITIONS.map((font) => font.name),
  "sans",
  "serif",
  "mono",
] as const;
export const fontName = Schema.Literals(FONT_NAMES);
export const menuAccent = Schema.Literals(["subtle", "bold"]);
export const designSettings = Schema.Struct({
  // Defaults keep older saved designs and API clients compatible.
  style: Schema.Literals(STYLE_NAMES).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("nova" as const)),
  ),
  iconLibrary: Schema.Literals(ICON_LIBRARIES).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("lucide" as const)),
  ),
  fontHeading: Schema.Literals(["inherit", ...FONT_NAMES]).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("inherit" as const)),
  ),
  menuColor: Schema.Literals(MENU_COLORS).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("default" as const)),
  ),
  rtl: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  pointer: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  baseColor: Schema.Literals(BASE_COLORS),
  theme: themeName,
  chartColor: themeName,
  radius: radiusName,
  font: fontName,
  menuAccent,
}).check(
  Schema.makeFilter(
    (value) =>
      value.theme === value.baseColor || ACCENT_COLORS.some((color) => color === value.theme),
  ),
);
export type DesignSettings = typeof designSettings.Type;
export const defaultSettings: DesignSettings = {
  style: "nova",
  iconLibrary: "lucide",
  fontHeading: "inherit",
  menuColor: "default",
  rtl: false,
  pointer: false,
  baseColor: "neutral",
  theme: "neutral",
  chartColor: "neutral",
  radius: "default",
  font: "sans",
  menuAccent: "subtle",
};
export const designTokens = Schema.Struct({
  light: Schema.Record(Schema.String, Schema.String),
  dark: Schema.Record(Schema.String, Schema.String),
});
export const designRecord = Schema.Struct({
  projectId: Schema.String,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settings: designSettings,
  tokens: designTokens,
  guidance: Schema.String,
  sourceRevision: Schema.String,
  updatedAt: Schema.NullOr(Schema.String),
});
export const designDetail = Schema.Struct({ ...designRecord.fields, markdown: Schema.String });
export type ProjectDesign = typeof designDetail.Type;
export const readDesignInput = Schema.Struct({ project: projectReference });
const updateFields = {
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settings: Schema.optionalKey(designSettings),
  guidance: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64_000))),
  markdown: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(100_000))),
};
const validUpdate = (value: typeof updateBody.Type) =>
  (value.settings !== undefined || value.guidance !== undefined || value.markdown !== undefined) &&
  !(value.guidance !== undefined && value.markdown !== undefined);
const updateBody = Schema.Struct(updateFields);
export const updateDesignBody = updateBody.check(Schema.makeFilter(validUpdate));
export const updateDesignInput = Schema.Struct({
  project: projectReference,
  ...updateFields,
}).check(Schema.makeFilter(validUpdate));
