"use client";
// Adapted from shadcn/create Customizer and Picker (MIT).
import { Circle, ChevronDown, Type, Shapes } from "lucide-react";
import type { ReactNode } from "react";
import {
  BASE_COLORS,
  ACCENT_COLORS,
  ICON_LIBRARIES,
  type DesignSettings,
} from "@/lib/project-design/model";
import {
  changeBaseColor,
  FONT_OPTIONS,
  getThemesForBaseColor,
  RADII,
  STYLES,
} from "@/lib/project-design/config";
import { THEMES } from "@/lib/project-design/themes";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type Option<T extends string> = {
  value: T;
  label: string;
  swatch?: string;
  description?: string;
  fontFamily?: string;
};
function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled: boolean;
  icon?: ReactNode;
}) {
  const current = options.find((option) => option.value === value)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        disabled={disabled}
        className="design-picker"
        aria-label={`${label}: ${current.label}`}
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
          <span className="text-xs font-normal text-muted-foreground">{label}</span>
          <span className="max-w-full whitespace-normal break-words text-sm font-medium">
            {current.label}
          </span>
        </span>
        {current.swatch ? (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: current.swatch }}
          />
        ) : (
          icon || <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={10}
        className="max-h-[min(28rem,80dvh)] w-64 overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          aria-label={label}
          value={value}
          onValueChange={(next) => {
            const option = options.find((option) => option.value === next);
            if (option) onChange(option.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-9">
              {option.swatch && (
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: option.swatch }}
                />
              )}
              <span className="flex flex-col" style={{ fontFamily: option.fontFamily }}>
                {option.label}
                {option.description && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const colors = [...BASE_COLORS, ...ACCENT_COLORS].map((value) => {
  const theme = THEMES.find((theme) => theme.name === value)!;
  return {
    value,
    label: theme.title,
    swatch:
      theme.cssVars.dark[
        BASE_COLORS.some((name) => name === value) ? "muted-foreground" : "primary"
      ],
  };
});
const ICON_LABELS = {
  lucide: "Lucide",
  tabler: "Tabler",
  hugeicons: "Hugeicons",
  phosphor: "Phosphor",
  remixicon: "Remix Icon",
};

export function DesignCustomizer({
  value,
  onChange,
  disabled,
}: {
  value: DesignSettings;
  onChange: (value: DesignSettings) => void;
  disabled: boolean;
}) {
  const availableThemes = getThemesForBaseColor(value.baseColor);
  return (
    <div className="design-pickers">
      <div className="design-picker-group">
        <Picker
          label="Style"
          value={value.style}
          disabled={disabled}
          options={STYLES}
          icon={<Circle aria-hidden="true" />}
          onChange={(style) => onChange({ ...value, style })}
        />
      </div>
      <div className="design-picker-group">
        <Picker
          label="Base color"
          value={value.baseColor}
          disabled={disabled}
          options={BASE_COLORS.map((value) => ({
            ...colors.find((color) => color.value === value)!,
            value,
          }))}
          onChange={(baseColor) => onChange(changeBaseColor(value, baseColor))}
        />
        <Picker
          label="Theme"
          value={value.theme}
          disabled={disabled}
          options={colors.filter((color) =>
            availableThemes.some((theme) => theme.name === color.value),
          )}
          onChange={(theme) => onChange({ ...value, theme })}
        />
        <Picker
          label="Chart color"
          value={value.chartColor}
          disabled={disabled}
          options={colors}
          onChange={(chartColor) => onChange({ ...value, chartColor })}
        />
      </div>
      <div className="design-picker-group">
        <Picker
          label="Heading font"
          value={value.fontHeading}
          disabled={disabled}
          options={[{ value: "inherit", label: "Same as body" }, ...FONT_OPTIONS]}
          icon={<Type aria-hidden="true" />}
          onChange={(fontHeading) => onChange({ ...value, fontHeading })}
        />
        <Picker
          label="Body font"
          value={value.font}
          disabled={disabled}
          options={FONT_OPTIONS}
          icon={<Type aria-hidden="true" />}
          onChange={(font) => onChange({ ...value, font })}
        />
      </div>
      <div className="design-picker-group">
        <Picker
          label="Icon library"
          value={value.iconLibrary}
          disabled={disabled}
          options={ICON_LIBRARIES.map((value) => ({ value, label: ICON_LABELS[value] }))}
          icon={<Shapes aria-hidden="true" />}
          onChange={(iconLibrary) => onChange({ ...value, iconLibrary })}
        />
        <Picker
          label="Corner radius"
          value={value.radius}
          disabled={disabled}
          options={RADII.map((radius) => ({ value: radius.name, label: radius.label }))}
          onChange={(radius) => onChange({ ...value, radius })}
        />
      </div>
      <div className="design-picker-group">
        <Picker
          label="Menu color"
          value={value.menuColor}
          disabled={disabled}
          options={[
            { value: "default", label: "Default" },
            { value: "inverted", label: "Inverted" },
            { value: "default-translucent", label: "Default translucent" },
            { value: "inverted-translucent", label: "Inverted translucent" },
          ]}
          onChange={(menuColor) => onChange({ ...value, menuColor })}
        />
        <Picker
          label="Menu accent"
          value={value.menuAccent}
          disabled={disabled}
          options={[
            { value: "subtle", label: "Subtle" },
            { value: "bold", label: "Bold" },
          ]}
          onChange={(menuAccent) => onChange({ ...value, menuAccent })}
        />
      </div>
      <div className="design-picker-group">
        <Picker
          label="Text direction"
          value={value.rtl ? "rtl" : "ltr"}
          disabled={disabled}
          options={[
            { value: "ltr", label: "Left to right" },
            { value: "rtl", label: "Right to left" },
          ]}
          onChange={(direction) => onChange({ ...value, rtl: direction === "rtl" })}
        />
        <Picker
          label="Cursor"
          value={value.pointer ? "pointer" : "default"}
          disabled={disabled}
          options={[
            { value: "default", label: "Default" },
            { value: "pointer", label: "Pointer" },
          ]}
          onChange={(cursor) => onChange({ ...value, pointer: cursor === "pointer" })}
        />
      </div>
    </div>
  );
}
