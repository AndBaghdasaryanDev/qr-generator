import { assessScannability, hasBlockingIssue, type ScanIssue } from "./assess";
import { encodeQr, type EncodeResult } from "./encode";
import { buildGeometry, type QrGeometry } from "./geometry";
import type { QrStyle } from "./style";

export interface QrModel {
  encoded: EncodeResult;
  geometry: QrGeometry | null;
  issues: ScanIssue[];
  blocking: boolean;
}

/** Encodes, lays out and reviews a code. Pure: runs on the server and in the browser. */
export function computeQrModel(content: string, style: QrStyle): QrModel {
  const encoded = encodeQr(content, style.errorCorrection);
  if (!encoded.ok) return { encoded, geometry: null, issues: [], blocking: true };
  const geometry = buildGeometry(encoded.matrix, {
    margin: style.margin,
    moduleStyle: style.moduleStyle,
    finderStyle: style.finderStyle,
    logo: style.logo,
  });
  const issues = assessScannability(style, geometry, encoded.byteLength);
  return { encoded, geometry, issues, blocking: hasBlockingIssue(issues) };
}
