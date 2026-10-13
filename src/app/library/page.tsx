import type { Metadata } from "next";
import { LibraryView } from "@/features/library/library-view";

export const metadata: Metadata = {
  title: "My library",
  description: "Your saved QR code designs and dynamic QR codes, stored privately in this browser.",
  robots: { index: false },
};

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">My library</h1>
      <p className="mt-2 text-muted">Saved designs and dynamic codes — private to this browser, no account needed.</p>
      <div className="mt-8">
        <LibraryView />
      </div>
    </div>
  );
}
