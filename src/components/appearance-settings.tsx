"use client";

import { useSyncExternalStore } from "react";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useTheme } from "./ui/theme";

const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  // The server cannot know this browser's preference. Keep the first render identical.
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="appearance-theme">Theme</FieldLabel>
      <Select
        items={options}
        value={ready ? theme : null}
        disabled={!ready}
        onValueChange={(value) => {
          if (value) setTheme(value);
        }}
      >
        <SelectTrigger id="appearance-theme" aria-describedby="theme-description">
          <SelectValue placeholder="Loading preference…" />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription id="theme-description">
        Saved in this browser. System follows your device's appearance.
      </FieldDescription>
    </Field>
  );
}
