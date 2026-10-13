import { z } from "zod";

export const ERROR_CORRECTION_LEVELS = ["L", "M", "Q", "H"] as const;
export type ErrorCorrectionLevel = (typeof ERROR_CORRECTION_LEVELS)[number];

/** Share of codewords each level can restore (ISO/IEC 18004). */
export const ERROR_CORRECTION_RECOVERY: Record<ErrorCorrectionLevel, number> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
};

export const ERROR_CORRECTION_LABELS: Record<ErrorCorrectionLevel, string> = {
  L: "Low (~7%)",
  M: "Medium (~15%)",
  Q: "Quartile (~25%)",
  H: "High (~30%)",
};

export const MODULE_STYLES = ["square", "rounded", "dots"] as const;
export type ModuleStyle = (typeof MODULE_STYLES)[number];

export const FINDER_STYLES = ["square", "rounded", "circle"] as const;
export type FinderStyle = (typeof FINDER_STYLES)[number];

export const MIN_MARGIN = 0;
export const MAX_MARGIN = 10;
export const RECOMMENDED_MARGIN = 4;

export const MIN_LOGO_RATIO = 0.1;
export const MAX_LOGO_RATIO = 0.3;

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color such as #111827");

export const logoSchema = z.object({
  dataUrl: z
    .string()
    .max(2_000_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, "Logo must be a re-encoded PNG data URL"),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  sizeRatio: z.number().min(MIN_LOGO_RATIO).max(MAX_LOGO_RATIO),
  backgroundPlate: z.boolean(),
});
export type QrLogo = z.infer<typeof logoSchema>;

/** Visual settings that do not change the encoded data (besides error correction). */
export const qrStyleSchema = z.object({
  foreground: hexColorSchema,
  background: hexColorSchema,
  margin: z.number().int().min(MIN_MARGIN).max(MAX_MARGIN),
  errorCorrection: z.enum(ERROR_CORRECTION_LEVELS),
  moduleStyle: z.enum(MODULE_STYLES),
  finderStyle: z.enum(FINDER_STYLES),
  logo: logoSchema.nullable(),
});
export type QrStyle = z.infer<typeof qrStyleSchema>;

/** The subset of the style persisted server-side for dynamic codes (no uploaded media). */
export const storedQrStyleSchema = qrStyleSchema.omit({ logo: true });
export type StoredQrStyle = z.infer<typeof storedQrStyleSchema>;

export const DEFAULT_QR_STYLE: QrStyle = {
  foreground: "#111827",
  background: "#ffffff",
  margin: RECOMMENDED_MARGIN,
  errorCorrection: "M",
  moduleStyle: "square",
  finderStyle: "square",
  logo: null,
};
