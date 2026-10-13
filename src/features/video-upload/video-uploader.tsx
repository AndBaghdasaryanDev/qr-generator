"use client";

import { FileVideo, RotateCcw, UploadCloud, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ApiError, type UploadCredentials } from "@/features/dynamic/api";
import { formatBytes, sniffVideoType, VIDEO_SNIFF_BYTES, type VideoFileType } from "@/lib/video/file-type";
import { cn } from "@/lib/utils/cn";
import { fetchUploadConfig, uploadVideoFile, type UploadConfig } from "./upload-client";

const LARGE_FILE_BYTES = 50 * 1024 * 1024;

interface Inspected {
  file: File;
  type: VideoFileType;
  previewUrl: string;
  /** Null when this browser couldn't decode the file. */
  metadata: { duration: number; width: number; height: number } | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "selected"; item: Inspected }
  | { kind: "uploading"; item: Inspected; progress: number }
  | { kind: "finishing"; item: Inspected }
  | { kind: "done"; fileName: string }
  | { kind: "error"; item: Inspected | null; message: string };

/** Reads duration/size via a hidden <video>; resolves null if the browser can't decode it. */
function probe(url: string): Promise<Inspected["metadata"]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const finish = (value: Inspected["metadata"]) => {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      finish(video.videoWidth > 0 ? { duration: video.duration, width: video.videoWidth, height: video.videoHeight } : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VideoUploader({
  actionLabel,
  onUploaded,
}: {
  actionLabel: string;
  /** Attach the finished upload (create or update a code). Throwing shows the error. */
  onUploaded: (credentials: UploadCredentials, file: File) => Promise<void>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirmedRights, setConfirmedRights] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUploadConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch((e: unknown) => !cancelled && setConfigError(e instanceof ApiError ? e.message : "Couldn't check upload settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Release the local preview URL whenever the selected file changes or the component unmounts.
  const previewUrl = phase.kind === "idle" || phase.kind === "done" ? null : (phase.item?.previewUrl ?? null);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function inspect(file: File) {
    if (!config) return;
    if (file.size > config.maxBytes) {
      setPhase({ kind: "error", item: null, message: `This file is ${formatBytes(file.size)}. The limit on this server is ${formatBytes(config.maxBytes)}.` });
      return;
    }
    const type = sniffVideoType(new Uint8Array(await file.slice(0, VIDEO_SNIFF_BYTES).arrayBuffer()));
    if (!type) {
      setPhase({ kind: "error", item: null, message: "This isn't an MP4, WebM or MOV video file." });
      return;
    }
    const url = URL.createObjectURL(file);
    setPhase({ kind: "selected", item: { file, type, previewUrl: url, metadata: await probe(url) } });
  }

  async function start(item: Inspected) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "uploading", item, progress: 0 });
    try {
      const credentials = await uploadVideoFile(item.file, item.type.contentType, {
        signal: controller.signal,
        onProgress: (progress) => setPhase((p) => (p.kind === "uploading" ? { ...p, progress } : p)),
      });
      setPhase({ kind: "finishing", item });
      await onUploaded(credentials, item.file);
      setPhase({ kind: "done", fileName: item.file.name });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase({ kind: "selected", item });
        return;
      }
      setPhase({ kind: "error", item, message: error instanceof Error ? error.message : "The upload failed." });
    } finally {
      abortRef.current = null;
    }
  }

  if (configError) return <Notice tone="error">{configError}</Notice>;
  if (!config) return <p className="text-sm text-muted">Checking upload settings…</p>;
  if (!config.enabled) {
    return (
      <Notice tone="info" title="Video uploads aren't enabled on this server">
        Paste a link to a video hosted elsewhere (YouTube, Vimeo, cloud storage…) instead.
      </Notice>
    );
  }

  if (phase.kind === "done") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-4">
        <p className="text-sm text-success">
          <strong>{phase.fileName}</strong> is uploaded and linked to your QR code.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setPhase({ kind: "idle" })}>
          <RotateCcw aria-hidden /> Upload a different video
        </Button>
      </div>
    );
  }

  const item = phase.kind === "idle" ? null : phase.item;
  const busy = phase.kind === "uploading" || phase.kind === "finishing";

  return (
    <div className="space-y-4">
      {!item || phase.kind === "error" ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void inspect(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
            dragging ? "border-primary bg-primary-soft" : "border-border-strong hover:bg-surface-muted",
          )}
        >
          <UploadCloud className="size-8 text-primary" aria-hidden />
          <span className="font-medium text-fg">Choose a video or drop it here</span>
          <span className="text-xs text-subtle">MP4, WebM or MOV · up to {formatBytes(config.maxBytes)}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void inspect(file);
            }}
          />
        </label>
      ) : null}

      {item && (
        <div className="overflow-hidden rounded-xl border border-border">
          <video src={item.previewUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-black" aria-label="Preview of the selected video" />
          <div className="flex items-start gap-3 p-3">
            <FileVideo className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-fg">{item.file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(item.file.size)} · {item.type.extension.toUpperCase()}
                {item.metadata && ` · ${formatDuration(item.metadata.duration)} · ${item.metadata.width}×${item.metadata.height}`}
              </p>
            </div>
            {!busy && (
              <Button variant="ghost" size="sm" aria-label="Remove selected video" onClick={() => setPhase({ kind: "idle" })}>
                <X aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}

      {item && !item.metadata && (
        <Notice tone="warning">
          This browser can&apos;t play this file (common for HEVC/H.265 videos from iPhones). Some phones may still play it, but MP4
          (H.264) plays everywhere — consider converting it before uploading.
        </Notice>
      )}
      {item && item.file.size > LARGE_FILE_BYTES && (
        <Notice tone="info">Large files take a while to start on mobile data. A compressed 720p or 1080p MP4 is usually plenty.</Notice>
      )}

      {phase.kind === "error" && (
        <Notice tone="error" role="alert">
          {phase.message}
        </Notice>
      )}

      {busy && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span className="text-fg">{phase.kind === "finishing" ? "Finishing up…" : "Uploading…"}</span>
            <span className="text-muted tabular-nums">{phase.kind === "uploading" ? `${Math.round(phase.progress * 100)}%` : "100%"}</span>
          </div>
          <progress
            className="h-2 w-full overflow-hidden rounded-full accent-primary"
            max={1}
            value={phase.kind === "uploading" ? phase.progress : 1}
            aria-label="Upload progress"
          />
          {phase.kind === "uploading" && (
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Cancel upload
            </Button>
          )}
        </div>
      )}

      {item && !busy && (
        <>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={confirmedRights}
              onChange={(e) => setConfirmedRights(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              I own this video or have permission to share it. Illegal or infringing content will be removed.
            </span>
          </label>
          <Button onClick={() => void start(item)} disabled={!confirmedRights} className="w-full sm:w-auto">
            <UploadCloud aria-hidden /> {phase.kind === "error" ? "Retry upload" : actionLabel}
          </Button>
        </>
      )}
    </div>
  );
}
