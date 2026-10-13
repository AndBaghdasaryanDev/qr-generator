import { isDark, type QrMatrix } from "./encode";
import type { FinderStyle, ModuleStyle, QrLogo } from "./style";

const FINDER_SIZE = 7;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoPlacement {
  /** Box the logo image is drawn into (aspect ratio preserved). */
  image: Rect;
  /** Background-colored plate behind the logo, snapped to the module grid. */
  plate: (Rect & { radius: number }) | null;
}

export interface QrGeometry {
  /** Width/height in module units, including the quiet zone. */
  viewSize: number;
  /** Symbol size in modules, excluding the quiet zone. */
  symbolSize: number;
  /** A single path (fill-rule: evenodd) describing every dark shape. */
  path: string;
  /** Square styles render best with crisp edges; curved styles need anti-aliasing. */
  crispEdges: boolean;
  logo: LogoPlacement | null;
  /** Share of the symbol's modules hidden behind the logo (0–1). */
  logoCoverage: number;
  /** True if the logo area touches a finder pattern, which breaks detection. */
  logoOverlapsFinder: boolean;
}

export interface GeometryOptions {
  margin: number;
  moduleStyle: ModuleStyle;
  finderStyle: FinderStyle;
  logo: Pick<QrLogo, "width" | "height" | "sizeRatio" | "backgroundPlate"> | null;
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  const arc = (dx: number, dy: number) => `a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`;
  return (
    `M${fmt(x + rr)} ${fmt(y)}h${fmt(w - 2 * rr)}${arc(rr, rr)}` +
    `v${fmt(h - 2 * rr)}${arc(-rr, rr)}h${fmt(-(w - 2 * rr))}${arc(-rr, -rr)}` +
    `v${fmt(-(h - 2 * rr))}${arc(rr, -rr)}z`
  );
}

function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0` +
    `a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0z`
  );
}

function finderPath(x: number, y: number, style: FinderStyle): string {
  switch (style) {
    case "square":
      return rectPath(x, y, 7, 7) + rectPath(x + 1, y + 1, 5, 5) + rectPath(x + 2, y + 2, 3, 3);
    case "rounded":
      return (
        roundedRectPath(x, y, 7, 7, 2) +
        roundedRectPath(x + 1, y + 1, 5, 5, 1.4) +
        roundedRectPath(x + 2, y + 2, 3, 3, 0.9)
      );
    case "circle":
      return circlePath(x + 3.5, y + 3.5, 3.5) + circlePath(x + 3.5, y + 3.5, 2.5) + circlePath(x + 3.5, y + 3.5, 1.5);
  }
}

function alignmentPath(cx: number, cy: number, style: FinderStyle): string {
  switch (style) {
    case "square":
      return rectPath(cx - 2, cy - 2, 5, 5) + rectPath(cx - 1, cy - 1, 3, 3) + rectPath(cx, cy, 1, 1);
    case "rounded":
      return (
        roundedRectPath(cx - 2, cy - 2, 5, 5, 1.4) +
        roundedRectPath(cx - 1, cy - 1, 3, 3, 0.8) +
        roundedRectPath(cx, cy, 1, 1, 0.35)
      );
    case "circle":
      return circlePath(cx + 0.5, cy + 0.5, 2.5) + circlePath(cx + 0.5, cy + 0.5, 1.5) + circlePath(cx + 0.5, cy + 0.5, 0.5);
  }
}

/**
 * Alignment pattern centers (ISO/IEC 18004 Annex E), excluding the three that would
 * overlap finder patterns. Version 1 has none.
 */
export function alignmentCenters(version: number): Array<[row: number, col: number]> {
  if (version < 2) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const coords = [size - 7];
  for (let i = 1; i < count - 1; i++) coords.push(coords[i - 1] - step);
  coords.push(6);
  coords.reverse();

  const last = coords.length - 1;
  const centers: Array<[number, number]> = [];
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      centers.push([coords[i], coords[j]]);
    }
  }
  return centers;
}

export function isInFinder(row: number, col: number, size: number): boolean {
  const inTop = row < FINDER_SIZE;
  const inLeft = col < FINDER_SIZE;
  const inRight = col >= size - FINDER_SIZE;
  const inBottom = row >= size - FINDER_SIZE;
  return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
}

interface ClearedArea {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

function placeLogo(
  symbolSize: number,
  margin: number,
  logo: NonNullable<GeometryOptions["logo"]>,
): { placement: LogoPlacement; cleared: ClearedArea } {
  const side = logo.sizeRatio * symbolSize;
  const aspect = logo.width / logo.height;
  const imageWidth = aspect >= 1 ? side : side * aspect;
  const imageHeight = aspect >= 1 ? side / aspect : side;
  const center = margin + symbolSize / 2;
  const image: Rect = {
    x: center - imageWidth / 2,
    y: center - imageHeight / 2,
    width: imageWidth,
    height: imageHeight,
  };

  // Clear every module the (padded) logo box touches, so no partial modules peek out.
  const pad = logo.backgroundPlate ? 0.5 : 0.15;
  const colStart = Math.max(0, Math.floor(image.x - pad - margin));
  const colEnd = Math.min(symbolSize - 1, Math.ceil(image.x + imageWidth + pad - margin) - 1);
  const rowStart = Math.max(0, Math.floor(image.y - pad - margin));
  const rowEnd = Math.min(symbolSize - 1, Math.ceil(image.y + imageHeight + pad - margin) - 1);

  const plate = logo.backgroundPlate
    ? {
        x: margin + colStart,
        y: margin + rowStart,
        width: colEnd - colStart + 1,
        height: rowEnd - rowStart + 1,
        radius: 0.6,
      }
    : null;

  return { placement: { image, plate }, cleared: { rowStart, rowEnd, colStart, colEnd } };
}

export function buildGeometry(matrix: QrMatrix, options: GeometryOptions): QrGeometry {
  const { size } = matrix;
  const margin = options.margin;
  const viewSize = size + margin * 2;

  let logo: LogoPlacement | null = null;
  let cleared: ClearedArea | null = null;
  if (options.logo) {
    const placed = placeLogo(size, margin, options.logo);
    logo = placed.placement;
    cleared = placed.cleared;
  }
  const isCleared = (row: number, col: number) =>
    cleared !== null &&
    row >= cleared.rowStart &&
    row <= cleared.rowEnd &&
    col >= cleared.colStart &&
    col <= cleared.colEnd;

  const parts: string[] = [];
  parts.push(finderPath(margin, margin, options.finderStyle));
  parts.push(finderPath(margin + size - FINDER_SIZE, margin, options.finderStyle));
  parts.push(finderPath(margin, margin + size - FINDER_SIZE, options.finderStyle));

  // Alignment patterns are drawn as solid shapes in every style: scanners rely on their
  // 1:1:1 ring structure, which dot-shaped modules would destroy.
  const inAlignment = new Uint8Array(size * size);
  for (const [cy, cx] of alignmentCenters(matrix.version)) {
    let covered = false;
    for (let r = cy - 2; r <= cy + 2; r++) {
      for (let c = cx - 2; c <= cx + 2; c++) {
        inAlignment[r * size + c] = 1;
        if (isCleared(r, c)) covered = true;
      }
    }
    if (!covered) parts.push(alignmentPath(margin + cx, margin + cy, options.finderStyle));
  }

  let logoOverlapsFinder = false;
  let clearedCount = 0;

  for (let row = 0; row < size; row++) {
    let runStart = -1;
    for (let col = 0; col <= size; col++) {
      const inPattern = col < size && (isInFinder(row, col, size) || inAlignment[row * size + col] === 1);
      const hidden = col < size && isCleared(row, col);
      if (hidden) {
        clearedCount++;
        if (isInFinder(row, col, size)) logoOverlapsFinder = true;
      }
      const drawable = col < size && !inPattern && !hidden && isDark(matrix, row, col);

      if (options.moduleStyle === "square") {
        // Merge horizontal runs so adjacent modules don't show anti-aliasing seams.
        if (drawable && runStart < 0) runStart = col;
        if (!drawable && runStart >= 0) {
          parts.push(rectPath(margin + runStart, margin + row, col - runStart, 1));
          runStart = -1;
        }
      } else if (drawable) {
        const x = margin + col;
        const y = margin + row;
        parts.push(
          options.moduleStyle === "rounded"
            ? roundedRectPath(x + 0.04, y + 0.04, 0.92, 0.92, 0.3)
            : circlePath(x + 0.5, y + 0.5, 0.43),
        );
      }
    }
  }

  return {
    viewSize,
    symbolSize: size,
    path: parts.join(""),
    crispEdges: options.moduleStyle === "square" && options.finderStyle === "square",
    logo,
    logoCoverage: clearedCount / (size * size),
    logoOverlapsFinder,
  };
}
