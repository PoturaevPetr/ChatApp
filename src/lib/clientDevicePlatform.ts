/**
 * Тип клиентского устройства для UI (QR, иконки) — не по ширине экрана.
 */

import { getSecureStoragePlatformHint } from "@/lib/cryptoSecureStorage";

export type ClientDeviceKind = "ios" | "android" | "mobile_web" | "desktop_web";

export type StoredDeviceDisplayKind = "mobile" | "desktop";

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function mobileWebOs(): "ios" | "android" {
  if (typeof navigator === "undefined") return "ios";
  if (/Android/i.test(navigator.userAgent || "")) return "android";
  return "ios";
}

function nativeCapacitorPlatform(): "ios" | "android" | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const p = cap.getPlatform?.() ?? "web";
  if (p === "ios" || p === "android") return p;
  return null;
}

/** Определяет тип текущего клиента (native / mobile web / desktop web). */
export function detectClientDeviceKind(): ClientDeviceKind {
  if (typeof window === "undefined") return "desktop_web";

  const hint = getSecureStoragePlatformHint();
  if (hint === "ios" || hint === "android") return hint;

  const native = nativeCapacitorPlatform();
  if (native) return native;

  if (isMobileUserAgent()) return "mobile_web";
  return "desktop_web";
}

export function isMobileClientDevice(kind: ClientDeviceKind): boolean {
  return kind === "ios" || kind === "android" || kind === "mobile_web";
}

export function canScanDeviceLinkQr(kind: ClientDeviceKind): boolean {
  return isMobileClientDevice(kind);
}

/** Платформа для регистрации устройства на бэкенде. */
export function guessClientPlatformForApi(): "ios" | "android" | "web" {
  const kind = detectClientDeviceKind();
  if (kind === "ios" || kind === "android") return kind;
  if (kind === "mobile_web") return mobileWebOs();
  return "web";
}

/** Классификация записи из списка устройств (platform + name с сервера). */
export function resolveStoredDeviceDisplayKind(
  platform: string,
  name?: string | null,
): StoredDeviceDisplayKind {
  const p = (platform || "").toLowerCase();
  if (p === "ios" || p === "android") return "mobile";

  const n = (name || "").trim().toLowerCase();
  if (n === "ios" || n === "android" || n.includes("iphone") || n.includes("ipad")) {
    return "mobile";
  }

  return "desktop";
}

export function formatStoredDevicePlatformLabel(platform: string, name?: string | null): string {
  const p = (platform || "").toLowerCase();
  if (p === "ios") return "iOS";
  if (p === "android") return "Android";

  const n = (name || "").trim();
  if (p === "web") {
    if (n === "iOS" || n === "Android") return n;
    if (resolveStoredDeviceDisplayKind(platform, name) === "mobile") return n || "Телефон";
    return "Компьютер";
  }

  return platform || "Устройство";
}

export function isStoredMobileDevice(platform: string, name?: string | null): boolean {
  return resolveStoredDeviceDisplayKind(platform, name) === "mobile";
}
