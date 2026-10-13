import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { themeInitScript } from "@/components/layout/theme";
import { ToastProvider } from "@/components/ui/toast";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "QR Studio — Free QR Code Generator (Video, Wi-Fi, vCard & more)",
    template: "%s · QR Studio",
  },
  description:
    "Create free QR codes for websites, videos, Wi-Fi, contacts, WhatsApp, payments and more. Customize colors and logos, download PNG or SVG. No sign-up required.",
  applicationName: "QR Studio",
  openGraph: {
    type: "website",
    siteName: "QR Studio",
    title: "QR Studio — Free QR Code Generator",
    description: "Free QR codes for links, videos, Wi-Fi, contacts and more. Generated in your browser, no sign-up.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script adjusts the class before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
