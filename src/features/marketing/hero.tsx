import { Check, Clapperboard, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { QrSvg } from "@/features/qr/qr-svg";
import { computeQrModel } from "@/lib/qr/model";
import { DEFAULT_QR_STYLE } from "@/lib/qr/style";

export function Hero({
  eyebrow,
  title,
  description,
  sampleUrl,
  primaryCta,
  secondaryCta,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  sampleUrl: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
}) {
  // A real, scannable sample rendered on the server with the same engine as the generator.
  const sample = computeQrModel(sampleUrl, {
    ...DEFAULT_QR_STYLE,
    foreground: "#312e81",
    moduleStyle: "rounded",
    finderStyle: "rounded",
  });

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,var(--primary-soft),transparent)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted">{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={primaryCta.href} className={buttonClasses("primary", "lg")}>
              {primaryCta.label}
            </Link>
            {secondaryCta && (
              <Link href={secondaryCta.href} className={buttonClasses("secondary", "lg")}>
                <Clapperboard aria-hidden /> {secondaryCta.label}
              </Link>
            )}
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-muted sm:grid-cols-2">
            {[
              "No sign-up for static codes",
              "Generated in your browser",
              "PNG, SVG & JPEG up to 4096 px",
              "Colors, shapes & logos",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 text-success" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        {sample.geometry && (
          <div className="mx-auto w-full max-w-sm">
            <div className="rotate-2 rounded-3xl border border-border bg-surface p-6 shadow-raised transition-transform motion-safe:hover:rotate-0">
              <QrSvg
                geometry={sample.geometry}
                foreground="#312e81"
                background="#ffffff"
                logoDataUrl={null}
                label={`Sample QR code linking to ${sampleUrl}`}
                className="block aspect-square w-full rounded-xl"
              />
              <p className="mt-4 text-center text-sm font-medium text-muted">Scan me — I&apos;m a real QR code</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
