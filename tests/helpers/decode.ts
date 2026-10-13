import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";

/** Rasterizes an SVG string exactly as exported and decodes it like a scanner would. */
export function decodeSvg(svg: string, width = 600): string | null {
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render();
  return decodeRgba(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height);
}

export function decodeRgba(pixels: Uint8ClampedArray, width: number, height: number): string | null {
  const result = jsQR(pixels, width, height, { inversionAttempts: "attemptBoth" });
  if (!result) return null;
  // jsQR decodes byte mode as UTF-8 into `data`; fall back to raw bytes if needed.
  return result.data || new TextDecoder().decode(new Uint8Array(result.binaryData));
}
