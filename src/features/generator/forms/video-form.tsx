"use client";

import { CheckCircle2, Film, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import type { UploadCredentials } from "@/features/dynamic/api";
import { VideoUploader } from "@/features/video-upload/video-uploader";
import type { VideoInfo } from "@/lib/video/classify";
import { bind, type FormApi } from "./form-api";

export function VideoForm({
  api,
  video,
  hasCode,
  onUploaded,
}: {
  api: FormApi<"video">;
  video: VideoInfo | null;
  /** A dynamic code already exists, so a new upload replaces its video. */
  hasCode: boolean;
  onUploaded: (credentials: UploadCredentials, file: File) => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <Segmented
        label="Video source"
        value={api.values.source}
        onChange={(source) => api.set("source", source)}
        options={[
          { value: "link", label: "Paste a link" },
          { value: "upload", label: "Upload a file" },
        ]}
      />
      {api.values.source === "link" ? (
        <>
          <TextField
            label="Video link"
            type="url"
            inputMode="url"
            placeholder="https://youtu.be/… or https://example.com/video.mp4"
            hint="YouTube, Shorts, Vimeo, TikTok, Instagram Reels, Facebook, Twitch, Loom, direct MP4/WebM files or any video page."
            {...bind(api, "url")}
          />
          {video && <VideoInsights key={video.url} video={video} />}
        </>
      ) : (
        <VideoUploader
          actionLabel={hasCode ? "Upload and replace the video" : "Upload and create QR code"}
          onUploaded={onUploaded}
        />
      )}
    </div>
  );
}

function VideoInsights({ video }: { video: VideoInfo }) {
  const [testing, setTesting] = useState(false);
  const [playError, setPlayError] = useState(false);

  return (
    <section aria-label="Detected video" className="overflow-hidden rounded-xl border border-border bg-surface-muted">
      <div className="flex gap-4 p-4">
        {video.thumbnailUrl ? (
          // Thumbnail is loaded directly from YouTube's image CDN by the browser; nothing is proxied.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt=""
            width={120}
            height={90}
            referrerPolicy="no-referrer"
            className="h-[68px] w-[120px] shrink-0 rounded-lg bg-border object-cover"
          />
        ) : (
          <span className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-lg bg-surface text-muted">
            <Film className="size-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {video.label}
          </p>
          <p className="text-xs text-muted">
            QR code opens: <span className="font-mono break-all text-fg">{video.url}</span>
          </p>
          {video.videoId && <p className="text-xs text-subtle">Video ID: {video.videoId}</p>}
        </div>
      </div>
      {video.notes.length > 0 && (
        <ul className="space-y-1 border-t border-border px-4 py-3 text-xs text-muted">
          {video.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}
      {video.kind === "direct" && video.playableInBrowser && (
        <div className="border-t border-border px-4 py-3">
          {testing ? (
            <div className="space-y-2">
              <video
                src={video.url}
                controls
                playsInline
                preload="metadata"
                onError={() => setPlayError(true)}
                className="aspect-video w-full rounded-lg bg-black"
              />
              {playError && (
                <p role="alert" className="text-xs text-danger">
                  This browser couldn&apos;t play the file. The server may block playback in browsers, require a login,
                  or use an unsupported codec. Phones may behave the same way — check the link before printing.
                </p>
              )}
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setTesting(true)}>
              <Play aria-hidden /> Test playback in this browser
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
