/** Canonical public origin for metadata, sitemap and robots. */
export function siteUrl(): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the local default; the API logs invalid APP_URL values.
    }
  }
  return "http://localhost:3000";
}
