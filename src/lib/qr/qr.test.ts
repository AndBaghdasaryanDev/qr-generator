import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { decodeSvg } from "../../../tests/helpers/decode";
import { assessScannability, contrastRatio, hasBlockingIssue } from "./assess";
import { encodeQr, MAX_BYTE_CAPACITY, type QrMatrix } from "./encode";
import { alignmentCenters, buildGeometry } from "./geometry";
import { DEFAULT_QR_STYLE, FINDER_STYLES, MODULE_STYLES, type QrStyle } from "./style";
import { renderSvg } from "./svg";

function solidPngDataUrl(width: number, height: number): string {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 220;
    png.data[i + 1] = 38;
    png.data[i + 2] = 38;
    png.data[i + 3] = 255;
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

function encodeOrThrow(payload: string, style: QrStyle = DEFAULT_QR_STYLE): QrMatrix {
  const result = encodeQr(payload, style.errorCorrection);
  if (!result.ok) throw new Error(result.message);
  return result.matrix;
}

function renderFor(payload: string, style: QrStyle): string {
  const matrix = encodeOrThrow(payload, style);
  const geometry = buildGeometry(matrix, {
    margin: style.margin,
    moduleStyle: style.moduleStyle,
    finderStyle: style.finderStyle,
    logo: style.logo,
  });
  return renderSvg(geometry, {
    foreground: style.foreground,
    background: style.background,
    pixelSize: 512,
    logoDataUrl: style.logo?.dataUrl ?? null,
  });
}

describe("encodeQr", () => {
  it("rejects empty content", () => {
    const result = encodeQr("", "M");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("reports byte length in UTF-8, not characters", () => {
    const result = encodeQr("Բարեւ", "M");
    expect(result.ok).toBe(true);
    expect(result.byteLength).toBe(10);
  });

  it("rejects content above capacity with an actionable message", () => {
    const result = encodeQr("a".repeat(MAX_BYTE_CAPACITY.H + 1), "H");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too-long");
      expect(result.message).toMatch(/at most 1,273 bytes/);
    }
  });

  it("accepts content right at the byte-mode capacity", () => {
    const result = encodeQr("~".repeat(MAX_BYTE_CAPACITY.L), "L");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.matrix.version).toBe(40);
  });
});

describe("rendered SVG decodes back to the exact payload", () => {
  const payloads = [
    "https://example.com/path?query=1&x=ä",
    "Բարեւ, աշխարհ! Ողջույն 👋 — Armenian & emoji",
    "WIFI:T:WPA;S:Café\\;Net;P:p\\:ss\\,word;;",
    "x".repeat(800),
  ];

  for (const payload of payloads) {
    it(`decodes ${JSON.stringify(payload.slice(0, 30))}…`, () => {
      expect(decodeSvg(renderFor(payload, DEFAULT_QR_STYLE), 900)).toBe(payload);
    });
  }

  for (const moduleStyle of MODULE_STYLES) {
    for (const finderStyle of FINDER_STYLES) {
      it(`decodes with ${moduleStyle} modules and ${finderStyle} finders`, () => {
        const payload = "https://youtu.be/dQw4w9WgXcQ";
        const style: QrStyle = { ...DEFAULT_QR_STYLE, moduleStyle, finderStyle, foreground: "#1e3a8a" };
        expect(decodeSvg(renderFor(payload, style))).toBe(payload);
      });
    }
  }

  it("decodes with a logo at level H", () => {
    const payload = "https://example.com/menu";
    const style: QrStyle = {
      ...DEFAULT_QR_STYLE,
      errorCorrection: "H",
      logo: { dataUrl: solidPngDataUrl(64, 64), width: 64, height: 64, sizeRatio: 0.22, backgroundPlate: true },
    };
    const svg = renderFor(payload, style);
    expect(svg).toContain("<image");
    expect(decodeSvg(svg)).toBe(payload);
  });

  it("decodes inverted colors with a scanner that tries both polarities", () => {
    const payload = "inverted";
    const style: QrStyle = { ...DEFAULT_QR_STYLE, foreground: "#ffffff", background: "#000000" };
    expect(decodeSvg(renderFor(payload, style))).toBe(payload);
  });
});

describe("renderSvg safety", () => {
  const geometry = buildGeometry(encodeOrThrow("x"), {
    margin: 4,
    moduleStyle: "square",
    finderStyle: "square",
    logo: { width: 10, height: 10, sizeRatio: 0.2, backgroundPlate: false },
  });

  it("refuses colors that are not hex", () => {
    expect(() =>
      renderSvg(geometry, { foreground: 'red"/><script>', background: "#ffffff", pixelSize: 100, logoDataUrl: null }),
    ).toThrow();
  });

  it("refuses logo sources that are not PNG data URLs", () => {
    for (const logoDataUrl of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", 'data:image/png;base64,AA"/>']) {
      expect(() => renderSvg(geometry, { foreground: "#000000", background: "#ffffff", pixelSize: 100, logoDataUrl })).toThrow();
    }
  });

  it("escapes the title", () => {
    const svg = renderSvg(geometry, {
      foreground: "#000000",
      background: "#ffffff",
      pixelSize: 100,
      logoDataUrl: null,
      title: "<b>&",
    });
    expect(svg).toContain("<title>&lt;b&gt;&amp;</title>");
  });
});

describe("alignmentCenters", () => {
  it("matches the ISO 18004 table", () => {
    expect(alignmentCenters(1)).toEqual([]);
    expect(alignmentCenters(2)).toEqual([[18, 18]]);
    expect(alignmentCenters(7)).toHaveLength(6);
    expect(alignmentCenters(7)).toContainEqual([22, 22]);
    // Version 32 is the one irregular spacing in the table: 6, 34, 60, 86, 112, 138.
    expect(alignmentCenters(32)).toContainEqual([34, 60]);
    expect(alignmentCenters(32)).toContainEqual([138, 138]);
    expect(alignmentCenters(40)).toHaveLength(46);
  });

  it("keeps high-version dot codes decodable", () => {
    const payload = `https://example.com/${"segment/".repeat(25)}`;
    const style: QrStyle = { ...DEFAULT_QR_STYLE, moduleStyle: "dots", finderStyle: "circle" };
    expect(encodeOrThrow(payload, style).version).toBeGreaterThanOrEqual(9);
    expect(decodeSvg(renderFor(payload, style), 1000)).toBe(payload);
  });
});

describe("buildGeometry", () => {
  it("includes the quiet zone in the view size", () => {
    const matrix = encodeOrThrow("hello");
    const geometry = buildGeometry(matrix, { margin: 4, moduleStyle: "square", finderStyle: "square", logo: null });
    expect(geometry.viewSize).toBe(matrix.size + 8);
    expect(geometry.logoCoverage).toBe(0);
  });

  it("flags oversized logos that would hit the finder patterns", () => {
    const matrix = encodeOrThrow("hi", { ...DEFAULT_QR_STYLE, errorCorrection: "H" });
    const geometry = buildGeometry(matrix, {
      margin: 4,
      moduleStyle: "square",
      finderStyle: "square",
      logo: { width: 100, height: 100, sizeRatio: 0.9, backgroundPlate: true },
    });
    expect(geometry.logoOverlapsFinder).toBe(true);
  });
});

describe("assessScannability", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("blocks unreadable color combinations", () => {
    const issues = assessScannability({ ...DEFAULT_QR_STYLE, foreground: "#dddddd" }, null, 10);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("low-contrast");
  });

  it("warns about inverted codes and thin quiet zones without blocking", () => {
    const issues = assessScannability({ ...DEFAULT_QR_STYLE, foreground: "#ffffff", background: "#000000", margin: 1 }, null, 10);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["inverted", "small-margin"]));
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("blocks a large logo at low error correction", () => {
    const style: QrStyle = {
      ...DEFAULT_QR_STYLE,
      errorCorrection: "L",
      logo: { dataUrl: "data:image/png;base64,AA==", width: 1, height: 1, sizeRatio: 0.3, backgroundPlate: true },
    };
    const geometry = buildGeometry(encodeOrThrow("https://example.com", style), {
      margin: 4,
      moduleStyle: "square",
      finderStyle: "square",
      logo: style.logo,
    });
    expect(assessScannability(style, geometry, 19).map((i) => i.code)).toContain("logo-too-large");
  });

  it("warns about dense payloads", () => {
    expect(assessScannability(DEFAULT_QR_STYLE, null, 900).map((i) => i.code)).toContain("dense");
  });
});
