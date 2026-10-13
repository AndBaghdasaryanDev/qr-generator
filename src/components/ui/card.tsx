import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function SectionHeading({ step, title, description }: { step?: number; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      {step !== undefined && (
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-fg"
        >
          {step}
        </span>
      )}
      <div>
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
