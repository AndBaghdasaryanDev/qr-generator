"use client";

import { BookmarkPlus, QrCode, ScanLine } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ExportPanel } from "@/features/qr/export-panel";
import { QrSvg } from "@/features/qr/qr-svg";
import type { QrModel } from "@/features/qr/use-qr-model";
import { QR_TYPE_META, type PayloadResult, type QrType } from "@/lib/payloads/definitions";
import type { QrStyle } from "@/lib/qr/style";
import { cn } from "@/lib/utils/cn";
import { slugify } from "@/lib/utils/download";

const FIELD_LABELS: Record<string, string> = {
  url: "link",
  text: "text",
  to: "email address",
  phone: "phone number",
  ssid: "network name",
  password: "password",
  firstName: "name",
  latitude: "latitude",
  longitude: "longitude",
  handle: "username or link",
  title: "title",
  start: "start",
  name: "recipient name",
  iban: "IBAN",
};

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border-strong p-6 text-center">
      <QrCode className="size-10 text-subtle" aria-hidden />
      <p className="font-medium text-fg">{title}</p>
      <p className="max-w-56 text-sm text-muted">{message}</p>
    </div>
  );
}

export function PreviewPanel({
  type,
  result,
  model,
  content,
  style,
  name,
  onNameChange,
  isDynamic,
  awaitingDynamic,
  awaitingMessage,
  onSave,
}: {
  type: QrType;
  result: PayloadResult;
  model: QrModel;
  /** The exact string encoded in the code. */
  content: string;
  style: QrStyle;
  name: string;
  onNameChange: (name: string) => void;
  isDynamic: boolean;
  /** Dynamic mode selected but the short link hasn't been created yet. */
  awaitingDynamic: boolean;
  awaitingMessage: string;
  /** Null hides the button (e.g. uploaded videos, which live in the dynamic-code list instead). */
  onSave: (() => void) | null;
}) {
  const { encoded, geometry, issues, blocking } = model;
  const label = QR_TYPE_META[type].label;

  let body: ReactNode;
  if (awaitingDynamic) {
    body = (
      <EmptyState title="Dynamic code not created yet" message={awaitingMessage} />
    );
  } else if (!result.ok) {
    const invalid = Object.keys(result.errors).filter((f) => !result.missing.includes(f));
    body =
      invalid.length > 0 ? (
        <EmptyState title="Check your details" message={result.errors[invalid[0]] ?? "Some details need attention."} />
      ) : (
        <EmptyState
          title="Your QR code will appear here"
          message={`Enter the ${FIELD_LABELS[result.missing[0] ?? ""] ?? "details"} to generate it instantly.`}
        />
      );
  } else if (!encoded.ok) {
    body = <EmptyState title="Can't create this code" message={encoded.message} />;
  } else if (geometry) {
    body = (
      <div className="rounded-xl bg-surface-muted p-3">
        <QrSvg
          geometry={geometry}
          foreground={style.foreground}
          background={style.background}
          logoDataUrl={style.logo?.dataUrl ?? null}
          label={`QR code: ${content.slice(0, 120)}`}
          className="mx-auto block aspect-square w-full max-w-80 rounded-md"
        />
      </div>
    );
  }

  const ready = !awaitingDynamic && result.ok && encoded.ok && geometry !== null;
  const disabledReason = !ready
    ? "Complete the details to enable downloads."
    : blocking
      ? "Fix the problems above to enable downloads."
      : null;
  const fileBase = `qr-${slugify(name || label)}`;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Preview</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            isDynamic ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-muted text-muted",
          )}
        >
          {isDynamic ? "Dynamic" : "Static"} · {label}
        </span>
      </div>

      <div aria-live="polite" aria-atomic="false">
        {body}
      </div>

      {ready && encoded.ok && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted select-none hover:text-fg">
            Encoded content · version {encoded.matrix.version} · {encoded.matrix.size}×{encoded.matrix.size} modules ·{" "}
            {encoded.byteLength} bytes
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-muted p-3 font-mono text-xs break-all whitespace-pre-wrap text-fg">
            {content}
          </pre>
        </details>
      )}

      {ready && issues.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Scannability checks">
          {issues.map((issue) => (
            <li key={issue.code}>
              <Notice tone={issue.severity === "error" ? "error" : "warning"}>{issue.message}</Notice>
            </li>
          ))}
        </ul>
      )}
      {ready && result.ok && result.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {result.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 space-y-4 border-t border-border pt-5">
        <TextField
          label="Name"
          optional
          value={name}
          maxLength={80}
          placeholder={`My ${label.toLowerCase()} QR code`}
          onChange={(e) => onNameChange(e.target.value)}
          hint="Used for file names and your library."
        />
        <ExportPanel
          geometry={ready ? geometry : null}
          style={style}
          fileBaseName={fileBase}
          title={name || content.slice(0, 200)}
          disabledReason={disabledReason}
        />
        {onSave && (
          <Button variant="ghost" className="w-full" onClick={onSave} disabled={!result.ok}>
            <BookmarkPlus aria-hidden /> Save design to library
          </Button>
        )}
      </div>

      <div className="mt-4 flex gap-2.5 rounded-xl bg-surface-muted p-3 text-xs text-muted">
        <ScanLine className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Before printing, scan the code with at least two different phones at its final size. No QR code is guaranteed
          to scan everywhere — high contrast, a clear margin and a modest logo give the best odds.
        </p>
      </div>
    </Card>
  );
}
