/**
 * The site's canonical public origin, if one is configured:
 * 1. APP_URL (always wins — set it when you use a custom domain);
 * 2. on Vercel, the project's production domain (VERCEL_PROJECT_PRODUCTION_URL, provided
 *    automatically), so short links never point at a temporary preview deployment.
 */
export function configuredOrigin(): string | null {
  const candidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      console.error(`Ignoring invalid site URL: ${candidate}`);
    }
  }
  return null;
}

/** Canonical public origin for metadata, sitemap and robots. */
export function siteUrl(): string {
  return configuredOrigin() ?? "http://localhost:3000";
}
