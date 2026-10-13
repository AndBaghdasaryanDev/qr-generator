"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during server rendering and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
