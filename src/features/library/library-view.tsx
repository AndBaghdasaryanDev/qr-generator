"use client";

import { Copy, ExternalLink, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { manageUrlFor } from "@/features/dynamic/api";
import { QR_TYPE_ICONS } from "@/features/generator/type-icons";
import { QrSvg } from "@/features/qr/qr-svg";
import { buildPayloadFor, QR_TYPE_META } from "@/lib/payloads/definitions";
import { computeQrModel } from "@/lib/qr/model";
import { copyText } from "@/lib/utils/download";
import { useHydrated } from "@/lib/utils/use-hydrated";
import { deleteDesign, forgetDynamic, StorageError, useLibrary, type SavedDesign, type SavedDynamic } from "./storage";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function DesignCard({ design, onDelete }: { design: SavedDesign; onDelete: () => void }) {
  const model = useMemo(() => {
    const result = buildPayloadFor(design.type, design.values);
    return result.ok ? computeQrModel(result.payload, design.style) : null;
  }, [design]);
  const Icon = QR_TYPE_ICONS[design.type];
  return (
    <Card className="flex flex-col p-4">
      <div className="aspect-square overflow-hidden rounded-xl bg-surface-muted p-3">
        {model?.geometry ? (
          <QrSvg
            geometry={model.geometry}
            foreground={design.style.foreground}
            background={design.style.background}
            logoDataUrl={design.style.logo?.dataUrl ?? null}
            label={`QR code preview for ${design.name}`}
            className="h-full w-full rounded-md"
          />
        ) : (
          <p className="grid h-full place-items-center text-center text-sm text-muted">Preview unavailable</p>
        )}
      </div>
      <h3 className="mt-3 truncate font-semibold" title={design.name}>
        {design.name}
      </h3>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5" aria-hidden /> {QR_TYPE_META[design.type].label} · {formatDate(design.updatedAt)}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href={`/?load=${encodeURIComponent(design.id)}#generator`} className={buttonClasses("secondary", "sm", "flex-1")}>
          <Pencil aria-hidden /> Open
        </Link>
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${design.name}`}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function DynamicRow({ entry, onForget }: { entry: SavedDynamic; onForget: () => void }) {
  const notify = useToast();
  const manageUrl = manageUrlFor(entry.shortUrl, entry.code, entry.manageToken);
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.name}</p>
        <p className="truncate font-mono text-xs text-muted">{entry.shortUrl}</p>
        <p className="truncate text-xs text-subtle">→ {entry.destinationUrl}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={`/manage/${entry.code}#token=${entry.manageToken}`} className={buttonClasses("secondary", "sm")}>
          <ExternalLink aria-hidden /> Manage
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            const ok = await copyText(manageUrl);
            notify(ok ? "Management link copied. Keep it private." : "Couldn't copy the link.", ok ? "success" : "error");
          }}
        >
          <Copy aria-hidden /> Copy key link
        </Button>
        <Button variant="ghost" size="sm" onClick={onForget} aria-label={`Remove ${entry.name} from this browser`}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function OpenManageLink() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        const match = /\/manage\/([0-9A-Za-z]{10})#token=([A-Za-z0-9_-]{43})/.exec(value.trim());
        if (!match) {
          setError("Paste the full management link, e.g. https://…/manage/AbC123xYz9#token=…");
          return;
        }
        router.push(`/manage/${match[1]}#token=${match[2]}`);
      }}
    >
      <TextField
        label="Open a management link"
        className="flex-1"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(undefined);
        }}
        placeholder="https://…/manage/…#token=…"
        error={error}
        hint="Use this to manage a dynamic code created on another device."
      />
      <Button type="submit" variant="secondary" className="sm:mt-7">
        Open
      </Button>
    </form>
  );
}

type PendingDelete = { kind: "design"; item: SavedDesign } | { kind: "dynamic"; item: SavedDynamic } | null;

export function LibraryView() {
  const library = useLibrary();
  const hydrated = useHydrated();
  const notify = useToast();
  const [pending, setPending] = useState<PendingDelete>(null);

  function confirmDelete() {
    if (!pending) return;
    try {
      if (pending.kind === "design") {
        deleteDesign(pending.item.id);
        notify("Design deleted.");
      } else {
        forgetDynamic(pending.item.code);
        notify("Removed from this browser. The code itself keeps working.");
      }
    } catch (error) {
      notify(error instanceof StorageError ? error.message : "Couldn't update the library.", "error");
    }
    setPending(null);
  }

  if (!hydrated) {
    return <p className="text-muted">Loading your library…</p>;
  }

  return (
    <div className="space-y-12">
      <Notice tone="info">
        Your library is stored only in this browser. Clearing site data removes it — copy the management links of dynamic
        codes somewhere safe.
      </Notice>

      <section aria-labelledby="dynamic-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dynamic-heading" className="text-xl font-semibold">
              Dynamic QR codes
            </h2>
            <p className="text-sm text-muted">Editable codes with a short link. Manage destination, pause or view scans.</p>
          </div>
        </div>
        {library.dynamic.length === 0 ? (
          <Card className="p-6 text-sm text-muted">
            No dynamic codes yet. In the generator, choose a website or video, then switch to <strong>Dynamic</strong>.
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {library.dynamic.map((entry) => (
                <DynamicRow key={entry.code} entry={entry} onForget={() => setPending({ kind: "dynamic", item: entry })} />
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-5">
          <OpenManageLink />
        </Card>
      </section>

      <section aria-labelledby="designs-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="designs-heading" className="text-xl font-semibold">
              Saved designs
            </h2>
            <p className="text-sm text-muted">Static codes you saved, with their content and design.</p>
          </div>
          <Link href="/#generator" className={buttonClasses("primary", "sm")}>
            <Plus aria-hidden /> New QR code
          </Link>
        </div>
        {library.designs.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <FolderOpen className="size-10 text-subtle" aria-hidden />
            <p className="font-medium">No saved designs yet</p>
            <p className="max-w-sm text-sm text-muted">
              Create a QR code and press “Save design to library” to keep it here for later edits and downloads.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {library.designs.map((design) => (
              <li key={design.id}>
                <DesignCard design={design} onDelete={() => setPending({ kind: "design", item: design })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.kind === "dynamic" ? "Remove from this browser?" : "Delete this design?"}
        description={
          pending?.kind === "dynamic"
            ? "This only forgets the code here. The QR code keeps working; to disable it, open the manager and pause or delete it. Without the management link you won't be able to edit it again."
            : "The saved design will be removed from this browser. Downloaded images aren't affected."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {pending?.kind === "dynamic" ? "Remove" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}
