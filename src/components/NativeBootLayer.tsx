"use client";

import type { ReactNode } from "react";
import { NativeLaunchOverlay } from "@/components/NativeLaunchOverlay";
import { MobileUpdateGate } from "@/components/MobileUpdateGate";

/** Обертка корня: поверх приложения — нативный старт Kindred (только Capacitor). */
export function NativeBootLayer({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <NativeLaunchOverlay />
      <MobileUpdateGate />
    </>
  );
}
