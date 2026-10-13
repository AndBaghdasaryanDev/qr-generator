import { DENSE_PAYLOAD_BYTES } from "./encode";
import type { QrGeometry } from "./geometry";
import { ERROR_CORRECTION_RECOVERY, RECOMMENDED_MARGIN, type QrStyle } from "./style";

export type IssueSeverity = "error" | "warning";

export interface ScanIssue {
  severity: IssueSeverity;
  code:
    | "low-contrast"
    | "reduced-contrast"
    | "inverted"
    | "small-margin"
    | "logo-too-large"
    | "logo-risky"
    | "logo-finder-overlap"
    | "logo-low-ecc"
    | "dense";
  message: string;
}

/** Blocking threshold: below this, many phone cameras can't separate modules from background. */
export const MIN_CONTRAST_RATIO = 3;
export const RECOMMENDED_CONTRAST_RATIO = 4.5;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Heuristic scannability review. These are guard rails, not guarantees — always test
 * the final printed or displayed code with a few different phones.
 */
export function assessScannability(style: QrStyle, geometry: QrGeometry | null, byteLength: number): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const ratio = contrastRatio(style.foreground, style.background);

  if (ratio < MIN_CONTRAST_RATIO) {
    issues.push({
      severity: "error",
      code: "low-contrast",
      message: `Contrast is ${ratio.toFixed(1)}:1. Use at least ${MIN_CONTRAST_RATIO}:1 (ideally a dark color on a light background) so cameras can read the code.`,
    });
  } else if (ratio < RECOMMENDED_CONTRAST_RATIO) {
    issues.push({
      severity: "warning",
      code: "reduced-contrast",
      message: `Contrast is ${ratio.toFixed(1)}:1. It may scan poorly in dim light; ${RECOMMENDED_CONTRAST_RATIO}:1 or higher is safer.`,
    });
  }

  if (relativeLuminance(style.foreground) > relativeLuminance(style.background)) {
    issues.push({
      severity: "warning",
      code: "inverted",
      message: "Light modules on a dark background (inverted) are not supported by some older scanner apps.",
    });
  }

  if (style.margin < RECOMMENDED_MARGIN) {
    issues.push({
      severity: "warning",
      code: "small-margin",
      message: `A quiet zone under ${RECOMMENDED_MARGIN} modules can stop scanners from finding the code when it sits next to other graphics.`,
    });
  }

  if (geometry?.logo) {
    const capacity = ERROR_CORRECTION_RECOVERY[style.errorCorrection];
    const usage = geometry.logoCoverage / capacity;
    if (geometry.logoOverlapsFinder) {
      issues.push({
        severity: "error",
        code: "logo-finder-overlap",
        message: "The logo covers a corner finder pattern. Make the logo smaller.",
      });
    } else if (usage > 0.6) {
      issues.push({
        severity: "error",
        code: "logo-too-large",
        message: `The logo hides ${(geometry.logoCoverage * 100).toFixed(0)}% of the code — too much for error-correction level ${style.errorCorrection}. Make it smaller or raise error correction.`,
      });
    } else if (usage > 0.35) {
      issues.push({
        severity: "warning",
        code: "logo-risky",
        message: `The logo hides ${(geometry.logoCoverage * 100).toFixed(0)}% of the code. It should still scan, but test it on several phones.`,
      });
    }
    if (style.errorCorrection === "L" || style.errorCorrection === "M") {
      issues.push({
        severity: "warning",
        code: "logo-low-ecc",
        message: "Codes with a logo are more reliable with error correction Q or H.",
      });
    }
  }

  if (byteLength > DENSE_PAYLOAD_BYTES) {
    issues.push({
      severity: "warning",
      code: "dense",
      message: `This code holds ${byteLength} bytes, which makes it dense. Print it larger (at least 3–4 cm) or encode a short link instead.`,
    });
  }

  return issues;
}

export const hasBlockingIssue = (issues: ScanIssue[]) => issues.some((i) => i.severity === "error");
