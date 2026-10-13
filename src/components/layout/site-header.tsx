import Link from "next/link";
import { LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-lg font-semibold text-fg">
          <LogoMark className="size-8" />
          <span className="text-lg tracking-tight">QR Studio</span>
        </Link>
        <nav aria-label="Main" className="ml-6 hidden md:block">
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:flex" />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
