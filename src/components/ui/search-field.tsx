"use client";
import { useRef, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./input";
import { InputGroup, InputGroupAddon } from "./input-group";
import { Button } from "./button";

export function SearchField({
  id,
  label,
  placeholder,
  value,
  onValueChange,
  inputRef,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  return (
    <InputGroup>
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <Input
        ref={input}
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        data-slot="input-group-control"
        className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => {
              onValueChange("");
              input.current?.focus();
            }}
          >
            <X />
          </Button>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
