"use client";

import { useEffect, useState } from "react";
import {
  canScanDeviceLinkQr,
  detectClientDeviceKind,
  isMobileClientDevice,
  type ClientDeviceKind,
} from "@/lib/clientDevicePlatform";

export function useDeviceLinkQrCapabilities() {
  const [kind, setKind] = useState<ClientDeviceKind>(() =>
    typeof window === "undefined" ? "desktop_web" : detectClientDeviceKind(),
  );

  useEffect(() => {
    setKind(detectClientDeviceKind());
  }, []);

  const canScanQr = canScanDeviceLinkQr(kind);
  const isMobileDevice = isMobileClientDevice(kind);
  const isDesktopWeb = kind === "desktop_web";

  return {
    kind,
    canScanQr,
    isMobileDevice,
    isDesktopWeb,
    /** QR для нового устройства — inline в панели (ПК), fullscreen на телефоне */
    preferInlineLinkQr: isDesktopWeb,
  };
}
