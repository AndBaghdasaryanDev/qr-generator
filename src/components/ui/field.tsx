"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

const controlClasses = cn(
  "w-full rounded-xl border bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors",
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Wires label, hint and error to the control via id / aria-describedby / aria-invalid. */
export function FieldShell({ label, hint, error, optional, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type BaseProps = { label: string; hint?: ReactNode; error?: string; optional?: boolean; className?: string };

export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  ...input
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlClasses, "h-10", invalid ? "border-danger" : "border-border-strong")}
          {...input}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  ...textarea
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlClasses, "min-h-24 py-2.5 leading-relaxed", invalid ? "border-danger" : "border-border-strong")}
          {...textarea}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  className,
  children,
  ...select
}: BaseProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlClasses, "h-10 pr-8", invalid ? "border-danger" : "border-border-strong")}
          {...select}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
