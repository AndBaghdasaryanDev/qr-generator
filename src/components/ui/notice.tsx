import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type NoticeTone = "info" | "success" | "warning" | "error";

const tones: Record<NoticeTone, { classes: string; Icon: typeof Info }> = {
  info: { classes: "bg-primary-soft text-primary-soft-fg border-primary/20", Icon: Info },
  success: { classes: "bg-success-soft text-success border-success/25", Icon: CheckCircle2 },
  warning: { classes: "bg-warning-soft text-warning border-warning/25", Icon: AlertTriangle },
  error: { classes: "bg-danger-soft text-danger border-danger/25", Icon: XCircle },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const { classes, Icon } = tones[tone];
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm", classes, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}
