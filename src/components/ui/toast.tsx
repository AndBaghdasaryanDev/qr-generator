"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region: announced by screen readers without stealing focus. */}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "error" ? XCircle : toast.tone === "info" ? Info : CheckCircle2;
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg shadow-raised"
            >
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  toast.tone === "error" ? "text-danger" : toast.tone === "info" ? "text-primary" : "text-success",
                )}
              />
              <p className="flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 rounded p-1 text-subtle hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast must be used inside <ToastProvider>");
  return notify;
}
