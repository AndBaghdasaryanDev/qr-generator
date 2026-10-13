"use client";

import { ArrowLeftRight, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { LogoError, processLogoFile } from "@/lib/qr/logo";
import {
  DEFAULT_QR_STYLE,
  ERROR_CORRECTION_LABELS,
  ERROR_CORRECTION_LEVELS,
  MAX_LOGO_RATIO,
  MAX_MARGIN,
  MIN_LOGO_RATIO,
  MIN_MARGIN,
  type ErrorCorrectionLevel,
  type FinderStyle,
  type ModuleStyle,
  type QrStyle,
} from "@/lib/qr/style";
import { cn } from "@/lib/utils/cn";

const COLOR_PRESETS: Array<{ name: string; fg: string; bg: string }> = [
  { name: "Classic", fg: "#111827", bg: "#ffffff" },
  { name: "Indigo", fg: "#3730a3", bg: "#ffffff" },
  { name: "Forest", fg: "#14532d", bg: "#f0fdf4" },
  { name: "Crimson", fg: "#9f1239", bg: "#fff1f2" },
  { name: "Coffee", fg: "#422006", bg: "#fefce8" },
  { name: "Ocean", fg: "#0c4a6e", bg: "#f0f9ff" },
];

const HEX = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function normalizeHex(input: string): string | null {
  const match = HEX.exec(input.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${hex.toLowerCase()}`;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const id = useId();
  // Holds an in-progress (possibly invalid) hex while typing; null means "show the real value".
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && normalizeHex(draft) === null;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-border-strong bg-surface p-1"
        />
        <input
          id={id}
          value={draft ?? value}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          maxLength={7}
          onChange={(e) => {
            const hex = normalizeHex(e.target.value);
            if (hex && e.target.value.replace("#", "").length === 6) {
              onChange(hex);
              setDraft(null);
            } else {
              setDraft(e.target.value);
            }
          }}
          onBlur={() => {
            const hex = draft !== null ? normalizeHex(draft) : null;
            if (hex) onChange(hex);
            setDraft(null);
          }}
          className={cn(
            "h-10 w-full min-w-0 rounded-xl border bg-surface px-3 font-mono text-sm uppercase",
            invalid ? "border-danger" : "border-border-strong",
          )}
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <output htmlFor={id} className="text-sm text-muted tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

function LogoControls({ style, onChange }: { style: QrStyle; onChange: (patch: Partial<QrStyle>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raisedEcc, setRaisedEcc] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const logo = await processLogoFile(file);
      const raise = style.errorCorrection === "L" || style.errorCorrection === "M";
      setRaisedEcc(raise);
      onChange({
        logo: { ...logo, sizeRatio: style.logo?.sizeRatio ?? 0.22, backgroundPlate: style.logo?.backgroundPlate ?? true },
        ...(raise ? { errorCorrection: "H" as const } : {}),
      });
    } catch (err) {
      setError(err instanceof LogoError ? err.message : "The logo couldn't be processed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {style.logo ? (
        <>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimize */}
            <img
              src={style.logo.dataUrl}
              alt="Uploaded logo preview"
              className="size-14 rounded-lg border border-border bg-surface-muted object-contain p-1"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                <ImagePlus aria-hidden /> Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRaisedEcc(false);
                  onChange({ logo: null });
                }}
              >
                <Trash2 aria-hidden /> Remove
              </Button>
            </div>
          </div>
          <RangeField
            label="Logo size"
            value={Math.round(style.logo.sizeRatio * 100)}
            min={MIN_LOGO_RATIO * 100}
            max={MAX_LOGO_RATIO * 100}
            format={(v) => `${v}%`}
            onChange={(v) => style.logo && onChange({ logo: { ...style.logo, sizeRatio: v / 100 } })}
            hint="Share of the code's width. Smaller logos scan more reliably."
          />
          <Switch
            label="Background behind logo"
            description="Clears a tidy area around the logo so modules don't touch it."
            checked={style.logo.backgroundPlate}
            onCheckedChange={(v) => style.logo && onChange({ logo: { ...style.logo, backgroundPlate: v } })}
          />
          {raisedEcc && (
            <Notice tone="info">Error correction was raised to High so the code survives being partly covered.</Notice>
          )}
        </>
      ) : (
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <ImagePlus aria-hidden /> {busy ? "Processing…" : "Upload logo"}
        </Button>
      )}
      <p className="text-xs text-subtle">PNG, JPEG or WebP up to 2 MB. Processed in your browser — never uploaded.</p>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}

export function DesignPanel({ style, onChange }: { style: QrStyle; onChange: (patch: Partial<QrStyle>) => void }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="design-colors" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="design-colors" className="text-sm font-semibold text-fg">
            Colors
          </h3>
          <Button variant="ghost" size="sm" onClick={() => onChange({ foreground: style.background, background: style.foreground })}>
            <ArrowLeftRight aria-hidden /> Swap
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Color presets">
          {COLOR_PRESETS.map((preset) => {
            const active = preset.fg === style.foreground && preset.bg === style.background;
            return (
              <button
                key={preset.name}
                type="button"
                aria-pressed={active}
                title={preset.name}
                aria-label={`${preset.name} colors`}
                onClick={() => onChange({ foreground: preset.fg, background: preset.bg })}
                className={cn(
                  "grid size-9 place-items-center rounded-full border-2 transition-transform hover:scale-105",
                  active ? "border-primary" : "border-border",
                )}
                style={{ background: preset.bg }}
              >
                <span className="size-4 rounded-full" style={{ background: preset.fg }} />
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Foreground" value={style.foreground} onChange={(foreground) => onChange({ foreground })} />
          <ColorField label="Background" value={style.background} onChange={(background) => onChange({ background })} />
        </div>
      </section>

      <section aria-labelledby="design-shapes" className="space-y-3">
        <h3 id="design-shapes" className="text-sm font-semibold text-fg">
          Shapes
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented<ModuleStyle>
            label="Modules"
            value={style.moduleStyle}
            onChange={(moduleStyle) => onChange({ moduleStyle })}
            options={[
              { value: "square", label: "Square" },
              { value: "rounded", label: "Rounded" },
              { value: "dots", label: "Dots" },
            ]}
          />
          <Segmented<FinderStyle>
            label="Corner eyes"
            value={style.finderStyle}
            onChange={(finderStyle) => onChange({ finderStyle })}
            options={[
              { value: "square", label: "Square" },
              { value: "rounded", label: "Rounded" },
              { value: "circle", label: "Circle" },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="design-logo" className="space-y-3">
        <h3 id="design-logo" className="text-sm font-semibold text-fg">
          Center logo
        </h3>
        <LogoControls style={style} onChange={onChange} />
      </section>

      <section aria-labelledby="design-advanced" className="space-y-4">
        <h3 id="design-advanced" className="text-sm font-semibold text-fg">
          Reliability
        </h3>
        <RangeField
          label="Quiet zone (margin)"
          value={style.margin}
          min={MIN_MARGIN}
          max={MAX_MARGIN}
          format={(v) => `${v} module${v === 1 ? "" : "s"}`}
          onChange={(margin) => onChange({ margin })}
          hint="The blank border scanners need. 4 is the standard."
        />
        <SelectField
          label="Error correction"
          value={style.errorCorrection}
          onChange={(e) => onChange({ errorCorrection: e.target.value as ErrorCorrectionLevel })}
          hint="Higher levels survive damage, dirt and logos, but make the code denser."
        >
          {ERROR_CORRECTION_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ERROR_CORRECTION_LABELS[level]}
            </option>
          ))}
        </SelectField>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ ...DEFAULT_QR_STYLE, logo: style.logo, errorCorrection: style.logo ? "H" : DEFAULT_QR_STYLE.errorCorrection })
          }
        >
          <RotateCcw aria-hidden /> Reset design to defaults
        </Button>
      </section>
    </div>
  );
}
