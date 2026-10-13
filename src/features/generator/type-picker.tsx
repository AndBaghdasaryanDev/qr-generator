"use client";

import { QR_TYPE_META, QR_TYPES, type QrType } from "@/lib/payloads/definitions";
import { cn } from "@/lib/utils/cn";
import { QR_TYPE_ICONS } from "./type-icons";

/** Native radio inputs styled as cards: arrow keys move between types. */
export function TypePicker({ value, onChange }: { value: QrType; onChange: (type: QrType) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">QR code type</legend>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {QR_TYPES.map((type) => {
          const Icon = QR_TYPE_ICONS[type];
          const selected = value === type;
          return (
            <label
              key={type}
              className={cn(
                // `relative` keeps the visually hidden radio inside its own card.
                "group relative flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-colors sm:gap-3 sm:p-3",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                selected
                  ? "border-primary bg-primary-soft text-primary-soft-fg"
                  : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="qr-type"
                value={type}
                checked={selected}
                onChange={() => onChange(type)}
                className="sr-only"
              />
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg sm:size-9",
                  selected ? "bg-primary text-primary-fg" : "bg-surface-muted text-muted group-hover:text-fg",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", !selected && "text-fg")}>{QR_TYPE_META[type].label}</span>
                <span className={cn("hidden truncate text-xs sm:block", selected ? "opacity-80" : "text-subtle")}>
                  {QR_TYPE_META[type].description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
