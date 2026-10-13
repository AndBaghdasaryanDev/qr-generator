"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * Native, responsive video player. It never autoplays with sound (browsers block that);
 * the viewer starts playback, so audio works as expected.
 */
export function VideoPlayer({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-black shadow-raised">
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={title}
          onError={() => setFailed(true)}
          className="aspect-video max-h-[75vh] w-full bg-black"
        />
      </div>
      {failed && (
        <Notice tone="error" role="alert" title="This video can't be played here">
          The file may have moved, require a login, or use a format your browser doesn&apos;t support. You can try opening it
          directly.
        </Notice>
      )}
      <a href={src} rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
        <ExternalLink aria-hidden /> Open the video file directly
      </a>
    </div>
  );
}
