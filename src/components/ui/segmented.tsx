"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Radio group rendered as a segmented control. Native radios give arrow-key
 * navigation and screen-reader semantics for free.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  size = "md",
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={cn("mb-1.5 text-sm font-medium text-fg", hideLabel && "sr-only")}>{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              // `relative` keeps the visually hidden radio inside its own label.
              "relative flex-1 cursor-pointer rounded-lg text-center font-medium whitespace-nowrap transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              value === option.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
