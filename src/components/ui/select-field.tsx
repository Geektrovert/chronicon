"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export function SelectField({
  id,
  label,
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  disabled,
  readOnly,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onBlur?: () => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Select
      items={options}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      readOnly={readOnly}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
    >
      <SelectTrigger onBlur={onBlur} id={id} aria-label={label} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
