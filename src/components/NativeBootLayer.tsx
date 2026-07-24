"use client";

import type { ReactNode } from "react";
import { NativeLaunchOverlay } from "@/components/NativeLaunchOverlay";
import { MobileUpdateGate } from "@/components/MobileUpdateGate";
import { OAuthNativeReturnHandler } from "@/components/OAuthNativeReturnHandler";
import { NativeBridgeBootstrap } from "@/components/NativeBridgeBootstrap";

/** Обертка корня: поверх приложения — нативный старт Kindred (только Capacitor). */
export function NativeBootLayer({ children }: { children: ReactNode }) {
  return (
    <NativeBridgeBootstrap>
      {children}
      <NativeLaunchOverlay />
      <MobileUpdateGate />
      <OAuthNativeReturnHandler />
    </NativeBridgeBootstrap>
  );
}
