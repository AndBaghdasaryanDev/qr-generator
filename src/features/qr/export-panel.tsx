"use client";

import { Copy, Download, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import type { QrGeometry } from "@/lib/qr/geometry";
import { minimumRasterSize, RasterSizeError, renderRaster } from "@/lib/qr/raster";
import type { QrStyle } from "@/lib/qr/style";
import { renderSvg } from "@/lib/qr/svg";
import { downloadBlob } from "@/lib/utils/download";
import { QrSvg } from "./qr-svg";

type ExportFormat = "png" | "svg" | "jpeg";

export const SIZE_PRESETS = [
  { value: 512, label: "Digital · 512 px", hint: "Websites, slides, messages" },
  { value: 1024, label: "Standard print · 1024 px", hint: "≈ 8.7 cm at 300 dpi" },
  { value: 2048, label: "High-res print · 2048 px", hint: "≈ 17 cm at 300 dpi" },
  { value: 4096, label: "Large format · 4096 px", hint: "Posters and banners" },
] as const;

export function ExportPanel({
  geometry,
  style,
  fileBaseName,
  title,
  disabledReason,
}: {
  geometry: QrGeometry | null;
  style: QrStyle;
  fileBaseName: string;
  /** Embedded in the SVG <title> and printed under the code. */
  title: string;
  /** When set, exports are disabled and the reason is shown. */
  disabledReason: string | null;
}) {
  const notify = useToast();
  const [format, setFormat] = useState<ExportFormat>("png");
  const [size, setSize] = useState<number>(1024);
  const [busy, setBusy] = useState(false);

  const ready = geometry !== null && !disabledReason;
  const tooSmall = geometry !== null && format !== "svg" && size < minimumRasterSize(geometry);
  const logo = style.logo?.dataUrl ?? null;

  async function makeBlob(kind: ExportFormat, g: QrGeometry): Promise<Blob> {
    if (kind === "svg") {
      const svg = renderSvg(g, {
        foreground: style.foreground,
        background: style.background,
        pixelSize: size,
        logoDataUrl: logo,
        title,
      });
      return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    }
    return renderRaster(g, { foreground: style.foreground, background: style.background, size, format: kind, logoDataUrl: logo });
  }

  async function handleDownload() {
    if (!geometry || !ready) return;
    setBusy(true);
    try {
      const blob = await makeBlob(format, geometry);
      const ext = format === "jpeg" ? "jpg" : format;
      downloadBlob(blob, `${fileBaseName}${format === "svg" ? "" : `-${size}px`}.${ext}`);
      notify(`Downloaded ${format.toUpperCase()}${format === "svg" ? "" : ` (${size}×${size})`}.`);
    } catch (error) {
      notify(error instanceof RasterSizeError || error instanceof Error ? error.message : "Download failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!geometry || !ready) return;
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      notify("Your browser can't copy images. Download the PNG instead.", "error");
      return;
    }
    try {
      const g = geometry;
      // Passing a promise keeps Safari's user-activation requirement satisfied.
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": renderRaster(g, {
            foreground: style.foreground,
            background: style.background,
            size: Math.max(512, minimumRasterSize(g)),
            format: "png",
            logoDataUrl: logo,
          }),
        }),
      ]);
      notify("QR code image copied to the clipboard.");
    } catch {
      notify("Copying was blocked by the browser. Download the PNG instead.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <Segmented
        label="Format"
        value={format}
        onChange={setFormat}
        options={[
          { value: "png", label: "PNG" },
          { value: "svg", label: "SVG" },
          { value: "jpeg", label: "JPEG" },
        ]}
      />
      {format === "svg" ? (
        <p className="text-xs text-subtle">SVG is vector: it stays sharp at any print size and is ideal for designers.</p>
      ) : (
        <SelectField
          label="Size"
          value={String(size)}
          onChange={(e) => setSize(Number(e.target.value))}
          hint={SIZE_PRESETS.find((p) => p.value === size)?.hint}
          error={tooSmall && geometry ? `This code needs at least ${minimumRasterSize(geometry)} px.` : undefined}
        >
          {SIZE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Button size="lg" onClick={handleDownload} disabled={!ready || busy || tooSmall} aria-describedby={disabledReason ? "export-disabled" : undefined}>
          <Download aria-hidden />
          {busy ? "Preparing…" : `Download ${format.toUpperCase()}`}
        </Button>
        <Button variant="secondary" size="lg" className="w-12 px-0" onClick={handleCopy} disabled={!ready} aria-label="Copy image to clipboard" title="Copy image">
          <Copy aria-hidden />
        </Button>
        <Button variant="secondary" size="lg" className="w-12 px-0" onClick={() => window.print()} disabled={!ready} aria-label="Print QR code" title="Print">
          <Printer aria-hidden />
        </Button>
      </div>
      {disabledReason && (
        <p id="export-disabled" className="text-sm text-muted">
          {disabledReason}
        </p>
      )}

      {ready && geometry && (
        <div id="print-area" aria-hidden>
          <QrSvg
            geometry={geometry}
            foreground={style.foreground}
            background={style.background}
            logoDataUrl={logo}
            label=""
            style={{ width: "6cm", height: "6cm" }}
          />
          <p style={{ font: "12pt system-ui, sans-serif", maxWidth: "12cm", textAlign: "center", wordBreak: "break-all" }}>
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
