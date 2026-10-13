"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme";

/** Disclosure-pattern menu for small screens: Escape closes it and returns focus. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface-muted"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-border bg-surface px-4 pt-2 pb-4 shadow-raised"
      >
        <nav aria-label="Mobile">
          <NavLinks vertical onNavigate={() => setOpen(false)} />
        </nav>
        <div className="mt-3 flex items-center justify-between border-t border-border px-3 pt-3">
          <span className="text-sm text-muted">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
