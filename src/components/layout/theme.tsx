"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "qr-studio:theme";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the wrong theme.
 * Kept dependency-free and tiny on purpose.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(preference: ThemePreference) {
  const dark =
    preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage blocked (private mode): the choice still applies for this page view.
  }
  apply(preference);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readPreference() === "system") apply("system");
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
  { value: "system", label: "System theme", Icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  return (
    <div role="radiogroup" aria-label="Color theme" className={cn("flex rounded-xl bg-surface-muted p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            "grid size-8 place-items-center rounded-lg transition-colors",
            preference === value ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-fg",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
