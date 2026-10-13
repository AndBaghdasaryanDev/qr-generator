"use client";

import { Copy, FileVideo, Pause, Play, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { forgetDynamic, getLibrary, saveDynamic, updateDynamicEntry } from "@/features/library/storage";
import { ExportPanel } from "@/features/qr/export-panel";
import { QrSvg } from "@/features/qr/qr-svg";
import { useQrModel } from "@/features/qr/use-qr-model";
import type { Presentation } from "@/lib/dynamic-types";
import type { QrStyle } from "@/lib/qr/style";
import { copyText, slugify } from "@/lib/utils/download";
import { parseWebUrl } from "@/lib/validation/url";
import { classifyVideoUrl } from "@/lib/video/classify";
import { VideoUploader } from "@/features/video-upload/video-uploader";
import { formatBytes } from "@/lib/video/file-type";
import { ApiError, deleteDynamicQr, getDynamicQr, updateDynamicQr, type DynamicQrView, type UploadCredentials } from "./api";

type LoadState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "error"; message: string; httpStatus: number }
  | { status: "deleted" }
  | { status: "ready"; qr: DynamicQrView; token: string };

/** Reads the management token from the URL fragment (never sent to servers) or the local library. */
function readToken(code: string): { token: string | null; fromHash: boolean } {
  const match = /(?:^#|&)token=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
  if (match) return { token: match[1], fromHash: true };
  const saved = getLibrary().dynamic.find((d) => d.code === code);
  return { token: saved?.manageToken ?? null, fromHash: false };
}

export function ManageView({ code }: { code: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    const { token, fromHash } = readToken(code);
    if (!token) {
      setState({ status: "no-token" });
      return;
    }
    if (fromHash) {
      // Keep the key out of the visible address bar and browser history.
      window.history.replaceState(null, "", window.location.pathname);
    }
    try {
      const { qr } = await getDynamicQr(code, token);
      try {
        const existing = getLibrary().dynamic.find((d) => d.code === code);
        if (existing) updateDynamicEntry(code, { name: qr.name, destinationUrl: qr.destinationUrl, manageToken: token });
        else
          saveDynamic({
            code,
            name: qr.name,
            shortUrl: qr.shortUrl,
            manageToken: token,
            destinationUrl: qr.destinationUrl,
            createdAt: qr.createdAt,
          });
      } catch {
        // Storage unavailable: managing still works for this visit.
      }
      setState({ status: "ready", qr, token });
    } catch (error) {
      if (error instanceof ApiError) setState({ status: "error", message: error.message, httpStatus: error.status });
      else setState({ status: "error", message: "Something went wrong while loading this code.", httpStatus: 0 });
    }
  }, [code]);

  useEffect(() => {
    // Loading depends on the URL fragment and localStorage, which only exist in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  switch (state.status) {
    case "loading":
      return <p className="text-muted">Loading QR code…</p>;
    case "no-token":
      return (
        <Notice tone="warning" title="Management link required">
          This browser doesn&apos;t have the key for code <code className="font-mono">{code}</code>. Open the full
          management link you received when the code was created (it ends with <code>#token=…</code>). Lost links
          can&apos;t be recovered because there are no accounts.
        </Notice>
      );
    case "deleted":
      return (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">QR code deleted</h2>
          <p className="mt-2 text-sm text-muted">Scans of this code now show a “removed” page. The short link won&apos;t be reused.</p>
          <Link href="/library" className={buttonClasses("secondary", "md", "mt-4")}>
            Back to library
          </Link>
        </Card>
      );
    case "error":
      return (
        <div className="space-y-4">
          <Notice tone="error" title={state.httpStatus === 404 ? "Code not found" : state.httpStatus === 403 ? "Access denied" : "Couldn't load"} role="alert">
            {state.message}
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
            {state.httpStatus === 404 && getLibrary().dynamic.some((d) => d.code === code) && (
              <Button
                variant="ghost"
                onClick={() => {
                  forgetDynamic(code);
                  setState({ status: "deleted" });
                }}
              >
                Remove from my library
              </Button>
            )}
          </div>
        </div>
      );
    case "ready":
      return (
        <ManageEditor
          qr={state.qr}
          token={state.token}
          onChange={(qr) => setState({ status: "ready", qr, token: state.token })}
          onDeleted={() => setState({ status: "deleted" })}
        />
      );
  }
}

function ManageEditor({
  qr,
  token,
  onChange,
  onDeleted,
}: {
  qr: DynamicQrView;
  token: string;
  onChange: (qr: DynamicQrView) => void;
  onDeleted: () => void;
}) {
  const notify = useToast();
  const isUpload = qr.source.kind === "upload";
  const [name, setName] = useState(qr.name);
  const [sourceTab, setSourceTab] = useState<"link" | "upload">(qr.source.kind);
  const [destination, setDestination] = useState(isUpload ? "" : qr.destinationUrl);
  const [presentation, setPresentation] = useState<Presentation>(qr.presentation);
  const [destinationError, setDestinationError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style: QrStyle = { ...qr.style, logo: null };
  const model = useQrModel(qr.shortUrl, style);

  const linkTab = sourceTab === "link";
  const parsedDestination = parseWebUrl(destination);
  const video = parsedDestination.ok ? classifyVideoUrl(parsedDestination.href) : null;
  const canUsePlayer = linkTab
    ? Boolean(video?.ok && video.info.kind === "direct" && video.info.playableInBrowser && video.info.url.startsWith("https://"))
    : true;
  const effectivePresentation: Presentation = canUsePlayer ? presentation : "redirect";
  const nameChanged = name.trim() !== "" && name.trim() !== qr.name;
  const linkChanged = linkTab && destination.trim() !== "" && destination.trim() !== (isUpload ? "" : qr.destinationUrl);
  // Presentation edits apply to the current source, or travel with a new link.
  const presentationChanged = effectivePresentation !== qr.presentation && (sourceTab === qr.source.kind || linkChanged);
  const dirty = nameChanged || linkChanged || presentationChanged;

  function syncLibrary(updated: DynamicQrView) {
    try {
      updateDynamicEntry(qr.code, {
        name: updated.name,
        destinationUrl: updated.source.kind === "upload" ? `Uploaded video: ${updated.source.fileName}` : updated.destinationUrl,
      });
    } catch {
      // Local copy is a convenience only.
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      if (err instanceof ApiError && err.field === "destinationUrl") setDestinationError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (linkChanged && !parsedDestination.ok) {
      setDestinationError(parsedDestination.error);
      return;
    }
    void run(async () => {
      const { qr: updated } = await updateDynamicQr(qr.code, token, {
        ...(nameChanged ? { name: name.trim() } : {}),
        ...(linkChanged && parsedDestination.ok ? { destinationUrl: parsedDestination.href } : {}),
        ...(presentationChanged || linkChanged ? { presentation: effectivePresentation } : {}),
      });
      onChange(updated);
      setDestination(updated.source.kind === "link" ? updated.destinationUrl : "");
      setName(updated.name);
      setPresentation(updated.presentation);
      syncLibrary(updated);
      notify(linkChanged && isUpload ? "Saved. The code now opens the link and the uploaded video was deleted." : "Saved.");
    });
  }

  async function replaceVideo(upload: UploadCredentials) {
    const { qr: updated } = await updateDynamicQr(qr.code, token, { upload, presentation: effectivePresentation });
    onChange(updated);
    setDestination("");
    setPresentation(updated.presentation);
    syncLibrary(updated);
    notify("Video uploaded. The printed code now plays the new video.");
  }

  function toggleActive() {
    void run(async () => {
      const { qr: updated } = await updateDynamicQr(qr.code, token, { isActive: !qr.isActive });
      onChange(updated);
      notify(updated.isActive ? "Code resumed." : "Code paused. Scans show a “paused” page.");
    });
  }

  function remove() {
    void run(async () => {
      await deleteDynamicQr(qr.code, token);
      try {
        forgetDynamic(qr.code);
      } catch {
        // Ignore storage errors; the server-side delete succeeded.
      }
      setConfirmDelete(false);
      notify("QR code deleted.");
      onDeleted();
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{qr.name}</h2>
            <span
              className={
                qr.isActive
                  ? "rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success"
                  : "rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning"
              }
            >
              {qr.isActive ? "Active" : "Paused"}
            </span>
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Scans</dt>
              <dd className="text-2xl font-semibold tabular-nums">{qr.scanCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted">Last scan</dt>
              <dd className="font-medium">{qr.lastScannedAt ? new Date(qr.lastScannedAt).toLocaleString() : "Never"}</dd>
            </div>
            <div>
              <dt className="text-muted">Created</dt>
              <dd className="font-medium">{new Date(qr.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-muted p-3">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{qr.shortUrl}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const ok = await copyText(qr.shortUrl);
                notify(ok ? "Short link copied." : "Couldn't copy the link.", ok ? "success" : "error");
              }}
            >
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">
            Scan counts include every visit to the short link (including link previews in some chat apps). No personal
            data about visitors is stored.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Edit destination</h2>
          <form
            className="mt-4 space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            {qr.qrType === "video" && (
              <Segmented
                label="Destination"
                value={sourceTab}
                onChange={setSourceTab}
                options={[
                  { value: "link", label: "Link" },
                  { value: "upload", label: "Uploaded video" },
                ]}
              />
            )}
            {linkTab ? (
              <TextField
                label="Destination link"
                type="url"
                inputMode="url"
                value={destination}
                placeholder={isUpload ? "https://…" : undefined}
                error={destinationError}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestinationError(undefined);
                }}
                hint={
                  isUpload
                    ? "Saving a link replaces the uploaded video, which will be deleted."
                    : video?.ok
                      ? `Detected: ${video.info.label}`
                      : "Any https:// link — the printed code stays the same."
                }
              />
            ) : (
              <div className="space-y-3">
                {qr.source.kind === "upload" && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
                    <FileVideo className="size-5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{qr.source.fileName}</p>
                      <p className="text-xs text-muted">
                        {formatBytes(qr.source.sizeBytes)} · hosted by this service
                      </p>
                    </div>
                  </div>
                )}
                <VideoUploader
                  actionLabel={isUpload ? "Upload and replace" : "Upload and use this video"}
                  onUploaded={(upload) => replaceVideo(upload)}
                />
              </div>
            )}
            {canUsePlayer && (
              <Segmented<Presentation>
                label="When scanned"
                value={effectivePresentation}
                onChange={setPresentation}
                options={[
                  { value: "player", label: "Show video player page" },
                  { value: "redirect", label: "Open the file" },
                ]}
              />
            )}
            <Button type="submit" disabled={!dirty || busy}>
              <Save aria-hidden /> {busy ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={toggleActive} disabled={busy}>
              {qr.isActive ? <Pause aria-hidden /> : <Play aria-hidden />} {qr.isActive ? "Pause code" : "Resume code"}
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 aria-hidden /> Delete permanently
            </Button>
          </div>
        </Card>

        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
      </div>

      <Card className="p-5 lg:sticky lg:top-20">
        <h2 className="mb-4 text-base font-semibold">Your QR code</h2>
        {model.geometry ? (
          <div className="rounded-xl bg-surface-muted p-3">
            <QrSvg
              geometry={model.geometry}
              foreground={style.foreground}
              background={style.background}
              logoDataUrl={null}
              label={`QR code for ${qr.shortUrl}`}
              className="mx-auto block aspect-square w-full max-w-72 rounded-md"
            />
          </div>
        ) : (
          <Notice tone="error">This code couldn&apos;t be rendered.</Notice>
        )}
        <p className="mt-3 text-xs text-subtle">
          Re-downloading gives the same code. Logos aren&apos;t stored on the server — add one again in the generator if needed.
        </p>
        <div className="mt-4">
          <ExportPanel
            geometry={model.geometry}
            style={style}
            fileBaseName={`qr-${slugify(qr.name)}`}
            title={qr.name}
            disabledReason={model.blocking ? "This design has scannability problems." : null}
          />
        </div>
      </Card>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this QR code?"
        description="Printed copies will stop working and show a “removed” page. This can't be undone, and the short link will never be reused."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}
