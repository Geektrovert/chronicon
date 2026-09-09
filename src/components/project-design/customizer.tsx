"use client";
// Controlled adaptation of shadcn/create Customizer and pickers (MIT).
// Source paths and modifications are recorded in THIRD_PARTY_NOTICES.md.
import { ChevronDown } from "lucide-react";
import { BASE_COLORS, ACCENT_COLORS, type DesignSettings } from "@/lib/project-design/model";
import { changeBaseColor, FONTS, getThemesForBaseColor, RADII } from "@/lib/project-design/config";
import { THEMES } from "@/lib/project-design/themes";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; swatch?: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        disabled={disabled}
        className="h-auto min-h-14 w-full justify-between gap-3 px-3 py-2"
        aria-label={`${label}: ${current?.label || value}`}
      >
        <span className="flex flex-col items-start gap-0.5 text-left">
          <span className="text-xs font-normal text-muted-foreground">{label}</span>
          <span className="text-sm font-medium">{current?.label || value}</span>
        </span>
        {current?.swatch ? (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: current.swatch }}
          />
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60">
        <DropdownMenuRadioGroup
          aria-label={label}
          value={value}
          onValueChange={(value) => {
            const option = options.find((option) => option.value === value);
            if (option) onChange(option.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.swatch && (
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: option.swatch }}
                />
              )}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const colors = [...BASE_COLORS, ...ACCENT_COLORS].map((value) => {
  const theme = THEMES.find((theme) => theme.name === value);
  return {
    value,
    label: theme?.title || value,
    swatch:
      theme?.cssVars.dark[
        BASE_COLORS.some((name) => name === value) ? "muted-foreground" : "primary"
      ],
  };
});

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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      <Picker
        label="Base color"
        value={value.baseColor}
        disabled={disabled}
        options={BASE_COLORS.map((value) => ({
          value,
          label: colors.find((color) => color.value === value)?.label || value,
          swatch: colors.find((color) => color.value === value)?.swatch,
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
        label="Chart colors"
        value={value.chartColor}
        disabled={disabled}
        options={colors}
        onChange={(chartColor) => onChange({ ...value, chartColor })}
      />
      <Picker
        label="Font"
        value={value.font}
        disabled={disabled}
        options={(["sans", "serif", "mono"] as const).map((value) => ({
          value,
          label: FONTS[value].label,
        }))}
        onChange={(font) => onChange({ ...value, font })}
      />
      <Picker
        label="Radius"
        value={value.radius}
        disabled={disabled}
        options={RADII.map((radius) => ({ value: radius.name, label: radius.label }))}
        onChange={(radius) => onChange({ ...value, radius })}
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
  );
}
