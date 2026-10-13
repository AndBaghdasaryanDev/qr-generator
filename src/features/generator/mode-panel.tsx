"use client";

import { Copy, ExternalLink, Link2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/features/dynamic/api";
import { isDynamicType } from "@/lib/dynamic-types";
import { QR_TYPE_META, type PayloadResult } from "@/lib/payloads/definitions";
import { copyText } from "@/lib/utils/download";
import { createFromGenerator, updateFromGenerator } from "./dynamic-actions";
import type { GeneratorAction, GeneratorState, Presentation } from "./state";

export function ModePanel({
  state,
  result,
  uploadMode,
  dispatch,
}: {
  state: GeneratorState;
  result: PayloadResult;
  /** The video is uploaded rather than linked, which always makes the code dynamic. */
  uploadMode: boolean;
  dispatch: (action: GeneratorAction) => void;
}) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qrType = state.type;
  const capable = isDynamicType(qrType);
  const webUrl = !uploadMode && result.ok ? result.webUrl : null;
  const video = result.ok ? result.video : null;
  const canUsePlayer = uploadMode || Boolean(video?.kind === "direct" && video.playableInBrowser && video.url.startsWith("https://"));
  const presentation: Presentation = canUsePlayer ? state.presentation : "redirect";
  const { dynamic } = state;

  // What would change if the user pressed "Update": a new link, or a new presentation.
  const linkChanged = Boolean(dynamic && webUrl && webUrl !== dynamic.destinationUrl);
  const presentationChanged = Boolean(dynamic && (webUrl || (uploadMode && dynamic.source === "upload")) && presentation !== dynamic.presentation);
  const pendingUpdate = linkChanged || presentationChanged;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const handleCreate = () =>
    run(async () => {
      if (!webUrl || !isDynamicType(qrType)) return;
      const { dynamic: created, warning } = await createFromGenerator(state, qrType, { destinationUrl: webUrl }, presentation);
      dispatch({ kind: "dynamicCreated", dynamic: created });
      notify(warning ?? "Dynamic QR code created and saved to your library.", warning ? "error" : "success");
    });

  const handleUpdate = () =>
    run(async () => {
      if (!dynamic) return;
      const updated = await updateFromGenerator(dynamic, linkChanged && webUrl ? { destinationUrl: webUrl, presentation } : { presentation });
      dispatch({ kind: "dynamicUpdated", dynamic: updated });
      notify("Updated. The printed code now uses the new settings.");
    });

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    notify(
      ok ? `${what} copied.` : `Couldn't copy automatically. Select the ${what.toLowerCase()} and copy it manually.`,
      ok ? "success" : "error",
    );
  }

  const presentationPicker = canUsePlayer && (
    <Segmented<Presentation>
      label="When scanned"
      value={presentation}
      onChange={(value) => dispatch({ kind: "setPresentation", presentation: value })}
      options={[
        { value: "player", label: "Show video player page" },
        { value: "redirect", label: "Open the file" },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      {uploadMode ? (
        <p className="text-sm text-muted">
          <strong className="font-semibold text-fg">Always dynamic:</strong> an uploaded video is hosted by this service, so the
          code contains a short link to it. You can replace the video later without reprinting, and the code works only while
          this service is online.
        </p>
      ) : (
        <Segmented
          label="How should the code work?"
          value={capable ? state.mode : "static"}
          onChange={(mode) => dispatch({ kind: "setMode", mode })}
          options={[
            { value: "static", label: "Static" },
            { value: "dynamic", label: "Dynamic (editable)", disabled: !capable },
          ]}
        />
      )}

      {!capable && (
        <p className="text-sm text-muted">
          {QR_TYPE_META[state.type].label} codes store their content inside the code itself, so they are always static.
        </p>
      )}

      {capable && !uploadMode && state.mode === "static" && (
        <p className="text-sm text-muted">
          <strong className="font-semibold text-fg">Static:</strong> the destination is written directly into the code.
          It&apos;s generated in your browser, works without this website, and never expires — but it can&apos;t be
          changed after printing and scans aren&apos;t counted.
        </p>
      )}

      {capable && (uploadMode || state.mode === "dynamic") && (
        <div className="space-y-4">
          {!uploadMode && (
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">Dynamic:</strong> the code contains a short link on this site that
              forwards to your destination. You can change the destination later without reprinting and see a scan count.
              It depends on this website and its database staying online.
            </p>
          )}

          {presentationPicker}

          {!dynamic && !uploadMode && (
            <>
              {result.ok && !webUrl && (
                <Notice tone="warning">This content isn&apos;t a web link, so it can&apos;t be made dynamic. Use static mode.</Notice>
              )}
              <Button onClick={handleCreate} disabled={!webUrl || busy} className="w-full sm:w-auto">
                <Sparkles aria-hidden /> {busy ? "Creating…" : "Create dynamic QR code"}
              </Button>
              {!result.ok && <p className="text-xs text-subtle">Enter a valid destination first.</p>}
            </>
          )}

          {dynamic && (
            <div className="space-y-3 rounded-xl border border-success/30 bg-success-soft p-4">
              <p className="text-sm font-semibold text-success">Dynamic code ready</p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Short link in the QR code</dt>
                  <dd className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-fg">{dynamic.shortUrl}</span>
                    <Button variant="ghost" size="sm" onClick={() => copy(dynamic.shortUrl, "Short link")} aria-label="Copy short link">
                      <Copy aria-hidden />
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Currently leads to</dt>
                  <dd className="truncate font-mono text-fg">
                    {dynamic.source === "upload" ? `Uploaded video: ${dynamic.fileName ?? "video"}` : dynamic.destinationUrl}
                  </dd>
                </div>
              </dl>
              <Notice tone="warning" title="Keep your management link private">
                It&apos;s the only key that can edit or delete this code. It&apos;s saved in this browser&apos;s library; copy
                it somewhere safe in case you clear your browser data.
              </Notice>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => copy(dynamic.manageUrl, "Management link")}>
                  <Link2 aria-hidden /> Copy management link
                </Button>
                <Link href={`/manage/${dynamic.code}#token=${dynamic.manageToken}`} className={buttonClasses("secondary", "sm")}>
                  <ExternalLink aria-hidden /> Open manager
                </Link>
                <Button variant="ghost" size="sm" onClick={() => dispatch({ kind: "resetDynamic" })}>
                  Start a new code
                </Button>
              </div>
              {pendingUpdate && (
                <div className="space-y-2 border-t border-success/20 pt-3">
                  <p className="text-sm text-fg">
                    {linkChanged
                      ? dynamic.source === "upload"
                        ? "You entered a link. Updating will point the code to it and delete the uploaded video."
                        : "You changed the destination. Update it to make the existing code use it."
                      : "You changed what happens when the code is scanned."}
                  </p>
                  <Button onClick={handleUpdate} disabled={busy} size="sm">
                    <RefreshCw aria-hidden /> {busy ? "Updating…" : linkChanged ? "Update destination" : "Apply change"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}
