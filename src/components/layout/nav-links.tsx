"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils/cn";

export const NAV_ITEMS = [
  { href: "/#generator", label: "Generator", match: null },
  { href: "/video", label: "Video QR", match: "/video" },
  { href: "/library", label: "My library", match: "/library" },
  { href: "/#how-it-works", label: "How it works", match: null },
] as const;

interface NavProps {
  vertical?: boolean;
  onNavigate?: () => void;
}

function NavList({ vertical, onNavigate, pathname }: NavProps & { pathname: string | null }) {
  return (
    <ul className={cn("flex", vertical ? "flex-col gap-1" : "items-center gap-1")}>
      {NAV_ITEMS.map((item) => {
        const active = item.match !== null && pathname === item.match;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-surface-muted text-fg" : "text-muted hover:bg-surface-muted hover:text-fg",
                vertical && "text-base",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavListWithPath(props: NavProps) {
  return <NavList {...props} pathname={usePathname()} />;
}

/**
 * The pathname is request data on dynamic routes, so the active state streams in;
 * the static shell already contains working links.
 */
export function NavLinks(props: NavProps) {
  return (
    <Suspense fallback={<NavList {...props} pathname={null} />}>
      <NavListWithPath {...props} />
    </Suspense>
  );
}
