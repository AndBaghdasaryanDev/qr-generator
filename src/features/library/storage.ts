"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { DEFAULT_VALUES, QR_TYPES, type AnyFormValues, type QrType } from "@/lib/payloads/definitions";
import { DEFAULT_QR_STYLE, qrStyleSchema, type QrStyle } from "@/lib/qr/style";

/**
 * Everything here lives only in this browser's localStorage. Nothing is uploaded.
 * Data is validated on read, so a corrupted or hand-edited entry can't break the app.
 */
const STORAGE_KEY = "qr-studio:library:v1";

export interface SavedDesign {
  id: string;
  name: string;
  type: QrType;
  values: AnyFormValues;
  style: QrStyle;
  createdAt: string;
  updatedAt: string;
}

export interface SavedDynamic {
  code: string;
  name: string;
  shortUrl: string;
  manageToken: string;
  destinationUrl: string;
  createdAt: string;
}

export interface Library {
  designs: SavedDesign[];
  dynamic: SavedDynamic[];
}

const EMPTY: Library = { designs: [], dynamic: [] };

const designSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120),
  type: z.enum(QR_TYPES),
  values: z.record(z.string(), z.union([z.string(), z.boolean()])),
  style: qrStyleSchema.catch(DEFAULT_QR_STYLE),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const dynamicSchema = z.object({
  code: z.string().regex(/^[0-9A-Za-z]{10}$/),
  name: z.string().max(120),
  shortUrl: z.url(),
  manageToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  destinationUrl: z.string().max(4096),
  createdAt: z.string(),
});

/** Keeps only known fields with the right primitive type, filling the rest from defaults. */
function sanitizeValues(type: QrType, raw: Record<string, string | boolean>): AnyFormValues {
  const defaults = DEFAULT_VALUES[type] as Record<string, string | boolean>;
  const out: Record<string, string | boolean> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw[key];
    out[key] = typeof value === typeof fallback ? (value as string | boolean) : fallback;
  }
  return out as AnyFormValues;
}

function parseLibrary(raw: string | null): Library {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as { designs?: unknown[]; dynamic?: unknown[] };
    const designs = (Array.isArray(data.designs) ? data.designs : []).flatMap((entry) => {
      const parsed = designSchema.safeParse(entry);
      return parsed.success ? [{ ...parsed.data, values: sanitizeValues(parsed.data.type, parsed.data.values) }] : [];
    });
    const dynamic = (Array.isArray(data.dynamic) ? data.dynamic : []).flatMap((entry) => {
      const parsed = dynamicSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
    return { designs, dynamic };
  } catch {
    return EMPTY;
  }
}

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedLibrary: Library = EMPTY;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): Library {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLibrary = parseLibrary(raw);
  }
  return cachedLibrary;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export class StorageError extends Error {}

function write(library: Library) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
      throw new StorageError("Your browser's storage is full. Delete some saved designs (logos take the most space).");
    }
    throw new StorageError("Your browser blocked local storage (private mode or disabled site data).");
  }
  listeners.forEach((l) => l());
}

export function useLibrary(): Library {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function getLibrary(): Library {
  return getSnapshot();
}

export function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function saveDesign(design: Omit<SavedDesign, "createdAt" | "updatedAt"> & { createdAt?: string }): void {
  const now = new Date().toISOString();
  const library = getSnapshot();
  const existing = library.designs.find((d) => d.id === design.id);
  const entry: SavedDesign = { ...design, createdAt: existing?.createdAt ?? design.createdAt ?? now, updatedAt: now };
  write({
    ...library,
    designs: [entry, ...library.designs.filter((d) => d.id !== design.id)],
  });
}

export function deleteDesign(id: string): void {
  const library = getSnapshot();
  write({ ...library, designs: library.designs.filter((d) => d.id !== id) });
}

export function saveDynamic(entry: SavedDynamic): void {
  const library = getSnapshot();
  write({ ...library, dynamic: [entry, ...library.dynamic.filter((d) => d.code !== entry.code)] });
}

export function updateDynamicEntry(code: string, patch: Partial<Omit<SavedDynamic, "code">>): void {
  const library = getSnapshot();
  write({ ...library, dynamic: library.dynamic.map((d) => (d.code === code ? { ...d, ...patch } : d)) });
}

export function forgetDynamic(code: string): void {
  const library = getSnapshot();
  write({ ...library, dynamic: library.dynamic.filter((d) => d.code !== code) });
}
