import { Generator } from "@/features/generator/generator";
import { Hero } from "@/features/marketing/hero";
import { Faq, HowItWorks, SupportedTypes } from "@/features/marketing/sections";
import { siteUrl } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="Free · No sign-up · No app-imposed limits"
        title={
          <>
            QR codes for anything, <span className="text-primary">free</span> and ready to print.
          </>
        }
        description="Websites, videos, Wi-Fi, contact cards, WhatsApp, payments and more. Customize colors, shapes and logos, then download a print-ready PNG or SVG — created right in your browser."
        sampleUrl={siteUrl()}
        primaryCta={{ href: "#generator", label: "Create a QR code" }}
        secondaryCta={{ href: "/video", label: "Video QR code" }}
      />
      <section id="generator" aria-labelledby="generator-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 id="generator-heading" className="sr-only">
          QR code generator
        </h2>
        <Generator />
      </section>
      <HowItWorks />
      <SupportedTypes />
      <Faq />
    </>
  );
}
