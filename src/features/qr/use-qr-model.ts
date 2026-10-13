"use client";

import { useDeferredValue, useMemo } from "react";
import { computeQrModel, type QrModel } from "@/lib/qr/model";
import type { QrStyle } from "@/lib/qr/style";

export type { QrModel };

/** Encodes and lays out the code; typing stays responsive because inputs are deferred. */
export function useQrModel(content: string, style: QrStyle): QrModel {
  const deferredContent = useDeferredValue(content);
  const deferredStyle = useDeferredValue(style);
  return useMemo(() => computeQrModel(deferredContent, deferredStyle), [deferredContent, deferredStyle]);
}
