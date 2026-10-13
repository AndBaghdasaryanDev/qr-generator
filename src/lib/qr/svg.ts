import type { QrGeometry } from "./geometry";
import { hexColorSchema, logoSchema } from "./style";

export interface SvgRenderOptions {
  foreground: string;
  background: string;
  /** Rendered width/height in pixels (the SVG itself stays vector). */
  pixelSize: number;
  logoDataUrl: string | null;
  title?: string;
}

const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (ch) =>
    ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch === '"' ? "&quot;" : "&apos;",
  );

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Serializes the geometry to a standalone, self-contained SVG document.
 * Every interpolated value is validated or escaped; the logo is only ever a PNG data URL
 * that the app re-encoded itself, so no user-supplied markup can end up in the file.
 */
export function renderSvg(geometry: QrGeometry, options: SvgRenderOptions): string {
  const foreground = hexColorSchema.parse(options.foreground);
  const background = hexColorSchema.parse(options.background);
  const size = Math.round(options.pixelSize);
  const v = geometry.viewSize;

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
      `width="${size}" height="${size}" viewBox="0 0 ${v} ${v}" ` +
      `shape-rendering="${geometry.crispEdges ? "crispEdges" : "geometricPrecision"}">`,
  ];
  if (options.title) parts.push(`<title>${escapeXml(options.title)}</title>`);
  parts.push(`<rect width="${v}" height="${v}" fill="${background}"/>`);
  parts.push(`<path d="${geometry.path}" fill="${foreground}" fill-rule="evenodd"/>`);

  if (geometry.logo && options.logoDataUrl) {
    const dataUrl = logoSchema.shape.dataUrl.parse(options.logoDataUrl);
    const { image, plate } = geometry.logo;
    if (plate) {
      parts.push(
        `<rect x="${fmt(plate.x)}" y="${fmt(plate.y)}" width="${fmt(plate.width)}" height="${fmt(plate.height)}" ` +
          `rx="${fmt(plate.radius)}" fill="${background}"/>`,
      );
    }
    parts.push(
      `<image x="${fmt(image.x)}" y="${fmt(image.y)}" width="${fmt(image.width)}" height="${fmt(image.height)}" ` +
        `preserveAspectRatio="xMidYMid meet" href="${dataUrl}" xlink:href="${dataUrl}"/>`,
    );
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}
