"use client";

// Adapted from shadcn/ui Base UI Slider (MIT).
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  getAriaLabel,
  ...props
}: SliderPrimitive.Root.Props & Pick<SliderPrimitive.Thumb.Props, "getAriaLabel">) {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [value ?? defaultValue ?? min];

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("w-full", className)}
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex min-h-6 w-full touch-none items-center select-none data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-2 grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator data-slot="slider-range" className="h-full bg-primary" />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            getAriaLabel={getAriaLabel}
            data-slot="slider-thumb"
            className="block size-4 rounded-full border border-border bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
