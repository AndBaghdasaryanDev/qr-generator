import type { QrGeometry } from "./geometry";

export type RasterFormat = "png" | "jpeg";

export class RasterSizeError extends Error {
  constructor(readonly minimumSize: number) {
    super(`Choose a size of at least ${minimumSize} px for this code.`);
    this.name = "RasterSizeError";
  }
}

/** Smallest raster size that still gives every module at least 2×2 pixels. */
export function minimumRasterSize(geometry: QrGeometry): number {
  return geometry.viewSize * 2;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

/**
 * Draws the code at the exact requested resolution (never by upscaling a smaller image).
 * Modules are snapped to whole pixels so edges stay crisp; leftover pixels widen the
 * quiet zone evenly.
 */
export async function renderRaster(
  geometry: QrGeometry,
  options: { foreground: string; background: string; size: number; format: RasterFormat; logoDataUrl: string | null },
): Promise<Blob> {
  const size = Math.round(options.size);
  const modulePx = Math.floor(size / geometry.viewSize);
  if (modulePx < 2) throw new RasterSizeError(minimumRasterSize(geometry));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't create an image canvas.");

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, size, size);

  const offset = Math.floor((size - modulePx * geometry.viewSize) / 2);
  ctx.save();
  ctx.translate(offset, offset);
  ctx.scale(modulePx, modulePx);
  ctx.fillStyle = options.foreground;
  ctx.fill(new Path2D(geometry.path), "evenodd");

  if (geometry.logo && options.logoDataUrl) {
    const { plate, image } = geometry.logo;
    if (plate) {
      ctx.fillStyle = options.background;
      ctx.beginPath();
      ctx.roundRect(plate.x, plate.y, plate.width, plate.height, plate.radius);
      ctx.fill();
    }
    const logo = await loadImage(options.logoDataUrl);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, image.x, image.y, image.width, image.height);
  }
  ctx.restore();

  const mime = options.format === "jpeg" ? "image/jpeg" : "image/png";
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be created. Try a smaller size."))),
      mime,
      0.95,
    );
  });
}
