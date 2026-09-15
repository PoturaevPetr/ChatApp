"use client";

import { useEffect, useState } from "react";
import {
  canScanDeviceLinkQr,
  detectClientDeviceKind,
  isMobileClientDevice,
  type ClientDeviceKind,
} from "@/lib/clientDevicePlatform";

/**
 * Тип устройства (iOS / Android / mobile web / desktop browser), не ширина экрана.
 */
export function useClientDeviceKind() {
  const [kind, setKind] = useState<ClientDeviceKind>(() =>
    typeof window === "undefined" ? "desktop_web" : detectClientDeviceKind(),
  );

  useEffect(() => {
    setKind(detectClientDeviceKind());
  }, []);

  const isMobileDevice = isMobileClientDevice(kind);
  const isDesktopWeb = kind === "desktop_web";

  return {
    kind,
    isMobileDevice,
    isDesktopWeb,
    /** Центрированная модалка на ПК-браузере, bottom sheet на телефоне */
    preferCenterModal: isDesktopWeb,
  };
}

export function useDeviceLinkQrCapabilities() {
  const { kind, isMobileDevice, isDesktopWeb } = useClientDeviceKind();

  return {
    kind,
    canScanQr: canScanDeviceLinkQr(kind),
    isMobileDevice,
    isDesktopWeb,
    preferInlineLinkQr: isDesktopWeb,
  };
}
