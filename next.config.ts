import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 * - Next.js injects inline bootstrap scripts, so 'unsafe-inline' is required for scripts
 *   unless nonces are used (which would force every page to render dynamically).
 * - media-src allows https: so the dynamic-QR video player can stream direct video files
 *   from the owner's chosen host. The server never fetches those files itself.
 * - img-src allows YouTube thumbnails for the video preview.
 */
/**
 * With S3-compatible storage, browsers upload straight to the bucket endpoint, so it must be
 * allowed in connect-src. Read at build time — set VIDEO_S3_ENDPOINT before `next build`.
 */
function storageOrigin(): string {
  if (process.env.VIDEO_UPLOAD_DRIVER !== "s3" || !process.env.VIDEO_S3_ENDPOINT) return "";
  try {
    return ` ${new URL(process.env.VIDEO_S3_ENDPOINT).origin}`;
  } catch {
    return "";
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob: https:",
  "font-src 'self'",
  `connect-src 'self'${storageOrigin()}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Load the MongoDB driver from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["mongodb"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
