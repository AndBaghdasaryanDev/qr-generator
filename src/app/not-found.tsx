import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-8")}>
        Go to the QR generator
      </Link>
    </div>
  );
}
