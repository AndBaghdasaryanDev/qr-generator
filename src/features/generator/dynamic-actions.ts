"use client";

import { createDynamicQr, manageUrlFor, updateDynamicQr, type DynamicQrView, type UploadCredentials } from "@/features/dynamic/api";
import { saveDynamic, StorageError, updateDynamicEntry } from "@/features/library/storage";
import type { DynamicQrType } from "@/lib/dynamic-types";
import { QR_TYPE_META } from "@/lib/payloads/definitions";
import type { StoredQrStyle } from "@/lib/qr/style";
import type { CreatedDynamic, GeneratorState, Presentation } from "./state";

function toCreated(qr: DynamicQrView, manageToken: string): CreatedDynamic {
  return {
    code: qr.code,
    shortUrl: qr.shortUrl,
    manageToken,
    manageUrl: manageUrlFor(qr.shortUrl, qr.code, manageToken),
    destinationUrl: qr.destinationUrl,
    presentation: qr.presentation,
    source: qr.source.kind,
    fileName: qr.source.kind === "upload" ? qr.source.fileName : undefined,
  };
}

/** How the library describes where a code leads. */
function describeDestination(qr: DynamicQrView): string {
  return qr.source.kind === "upload" ? `Uploaded video: ${qr.source.fileName}` : qr.destinationUrl;
}

function storedStyle(state: GeneratorState): StoredQrStyle {
  const { foreground, background, margin, errorCorrection, moduleStyle, finderStyle } = state.style;
  return { foreground, background, margin, errorCorrection, moduleStyle, finderStyle };
}

/**
 * Creates a dynamic code from the generator and remembers it in the local library.
 * Returns a warning when the code was created but couldn't be saved locally.
 */
export async function createFromGenerator(
  state: GeneratorState,
  qrType: DynamicQrType,
  target: { destinationUrl: string } | { upload: UploadCredentials },
  presentation: Presentation,
): Promise<{ dynamic: CreatedDynamic; warning: string | null }> {
  const name = state.name.trim() || `${QR_TYPE_META[qrType].label} QR code`;
  const response = await createDynamicQr({ name, qrType, presentation, style: storedStyle(state), ...target });
  let warning: string | null = null;
  try {
    saveDynamic({
      code: response.qr.code,
      name,
      shortUrl: response.qr.shortUrl,
      manageToken: response.manageToken,
      destinationUrl: describeDestination(response.qr),
      createdAt: response.qr.createdAt,
    });
  } catch (error) {
    warning =
      error instanceof StorageError
        ? `Created, but not saved locally: ${error.message} Copy the management link now.`
        : "Created, but couldn't save it locally. Copy the management link now.";
  }
  return { dynamic: toCreated(response.qr, response.manageToken), warning };
}

/** Changes where an existing code leads (new link, new upload, or presentation). */
export async function updateFromGenerator(
  dynamic: CreatedDynamic,
  patch: { destinationUrl?: string; upload?: UploadCredentials; presentation?: Presentation },
): Promise<CreatedDynamic> {
  const { qr } = await updateDynamicQr(dynamic.code, dynamic.manageToken, patch);
  try {
    updateDynamicEntry(dynamic.code, { destinationUrl: describeDestination(qr) });
  } catch {
    // The server is the source of truth; the local copy is only a convenience.
  }
  return toCreated(qr, dynamic.manageToken);
}
