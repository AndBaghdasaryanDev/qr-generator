import type { QrLogo } from "./style";

export const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_DIMENSION = 256;

export type LogoFormat = "png" | "jpeg" | "webp";

/** Identifies the real file type from its magic bytes — the file name and MIME type are not trusted. */
export function sniffImageType(bytes: Uint8Array): LogoFormat | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export class LogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoError";
  }
}

/**
 * Validates an uploaded logo and re-encodes it as a small PNG through a canvas. Re-encoding
 * strips metadata and guarantees that only plain pixels (never markup such as SVG) are
 * embedded in the generated code. The file never leaves the browser.
 */
export async function processLogoFile(file: File): Promise<Pick<QrLogo, "dataUrl" | "width" | "height">> {
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new LogoError(`The logo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Use an image under 2 MB.`);
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(header)) {
    throw new LogoError("Use a PNG, JPEG or WebP image. SVG and other formats aren't accepted for security reasons.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LogoError("This image couldn't be read. It may be damaged.");
  }
  try {
    if (bitmap.width < 16 || bitmap.height < 16) throw new LogoError("The logo is too small. Use at least 16×16 pixels.");
    const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new LogoError("Your browser couldn't process the image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } finally {
    bitmap.close();
  }
}
