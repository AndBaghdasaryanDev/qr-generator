import Link from "next/link";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-7" />
            QR Studio
          </div>
          <p className="mt-3 text-sm text-muted">
            A free QR code generator. Static codes are created entirely in your browser — no account, no tracking,
            no limits imposed by this app.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Create</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link className="hover:text-fg" href="/#generator">
                QR code generator
              </Link>
            </li>
            <li>
              <Link className="hover:text-fg" href="/video">
                Video QR codes
              </Link>
            </li>
            <li>
              <Link className="hover:text-fg" href="/library">
                My library
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Learn</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link className="hover:text-fg" href="/#how-it-works">
                Static vs dynamic
              </Link>
            </li>
            <li>
              <Link className="hover:text-fg" href="/#faq">
                FAQ & privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
