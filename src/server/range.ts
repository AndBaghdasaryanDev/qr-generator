export type ByteRange = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Parses a single-range `Range: bytes=…` header (inclusive end). Video players rely on
 * range requests to seek and to read MP4 metadata at the end of a file.
 * Returns null when the header is absent or uses multiple ranges (served as a full response).
 */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (startText === "" && endText === "") return null;

  let start: number;
  let end: number;
  if (startText === "") {
    // Suffix range: last N bytes.
    const suffix = Number(endText);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
