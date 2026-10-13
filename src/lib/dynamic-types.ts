import type { QrType } from "@/lib/payloads/definitions";

/** QR types whose payload can be a web link, and therefore a dynamic redirect. */
export const DYNAMIC_QR_TYPES = ["url", "video", "social", "app", "payment", "location", "whatsapp"] as const satisfies readonly QrType[];
export type DynamicQrType = (typeof DYNAMIC_QR_TYPES)[number];

export const PRESENTATIONS = ["redirect", "player"] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export function isDynamicType(type: QrType): type is DynamicQrType {
  return (DYNAMIC_QR_TYPES as readonly QrType[]).includes(type);
}
