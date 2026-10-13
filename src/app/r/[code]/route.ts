import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { recordScan, resolvePublicCode } from "@/server/dynamic-qr/service";
import { appOrigin } from "@/server/http";
import { statusPage } from "@/server/status-page";

/**
 * Counts the scan after the response is sent so visitors aren't kept waiting.
 * Analytics must never break a redirect, so every failure is swallowed and logged.
 */
function countScan(task: () => Promise<void>) {
  const run = () => task().catch((error: unknown) => console.error("Failed to record scan", error));
  try {
    after(run);
  } catch {
    // Outside a Next.js request scope (e.g. tests): fire and forget.
    void run();
  }
}

/**
 * Public entry point encoded in every dynamic QR code.
 * 302 (not 301/308) because the owner can change the destination at any time, and
 * `no-store` so neither browsers nor CDNs pin an old destination.
 */
export async function GET(request: Request, context: RouteContext<"/r/[code]">) {
  const { code } = await context.params;
  const origin = appOrigin(request);

  let resolution;
  try {
    const db = await getDb();
    resolution = await resolvePublicCode(db, code, origin);
    if (resolution.status === "redirect" || resolution.status === "player") {
      const { id } = resolution;
      countScan(() => recordScan(db, id));
    }
  } catch (error) {
    console.error("Redirect lookup failed", error);
    return statusPage(503, "Temporarily unavailable", "This QR code can't be opened right now. Please try again in a moment.");
  }

  switch (resolution.status) {
    case "redirect":
      return new Response(null, {
        status: 302,
        headers: { Location: resolution.url, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
      });
    case "player":
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin}/watch/${code}`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    case "disabled":
      return statusPage(403, "QR code paused", "The owner of this QR code has paused it. Check back later.");
    case "deleted":
      return statusPage(410, "QR code removed", "This QR code has been deleted by its owner and no longer leads anywhere.");
    case "not-found":
      return statusPage(404, "QR code not found", "We couldn't find this QR code. Check that the link is complete.");
  }
}
