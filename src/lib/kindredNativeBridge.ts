/**
 * Контракт тонкой нативной оболочки (MobileShell) ↔ hosted ChatApp.
 * См. docs/NATIVE_BRIDGE.md
 */

export const KINDRED_NATIVE_BRIDGE_VERSION = 1;

/** Возможности, которые shell объявляет (и web проверяет перед вызовом). */
export type KindredNativeCapability =
  | "push"
  | "camera"
  | "filesystem"
  | "secure_storage"
  | "oauth"
  | "meet_media"
  | "edge_to_edge"
  | "haptics";

export interface KindredNativeInfo {
  bridgeVersion: number;
  /** Semver оболочки (APK/IPA), не web UI */
  nativeVersion: string;
  platform: "ios" | "android" | "web";
  capabilities: KindredNativeCapability[];
  /** Origin hosted UI, с которого shell ожидает контент */
  hostedUiOrigin?: string;
}

declare global {
  interface Window {
    KindredNative?: KindredNativeInfo & {
      secureSet?: (key: string, value: string) => Promise<void>;
      secureGet?: (key: string) => Promise<string | null>;
      secureDelete?: (key: string) => Promise<void>;
    };
  }
}

const DEFAULT_CAPABILITIES: KindredNativeCapability[] = [
  "push",
  "camera",
  "filesystem",
  "secure_storage",
  "oauth",
  "meet_media",
  "edge_to_edge",
];

/** Прочитать инфо оболочки (inject / Capacitor). */
export function getKindredNativeInfo(): KindredNativeInfo | null {
  if (typeof window === "undefined") return null;
  if (window.KindredNative && typeof window.KindredNative === "object") {
    return window.KindredNative;
  }
  return null;
}

export function hasNativeCapability(cap: KindredNativeCapability): boolean {
  const info = getKindredNativeInfo();
  if (info?.capabilities?.includes(cap)) return true;
  if (typeof window === "undefined") return false;
  const capObj = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (capObj?.isNativePlatform?.()) {
    return DEFAULT_CAPABILITIES.includes(cap);
  }
  return false;
}

export function isHostedInNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  if (window.KindredNative) return true;
  const capObj = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capObj?.isNativePlatform?.());
}

/**
 * Минимальная версия shell для текущего web (из env).
 * Пусто — проверка отключена.
 */
export function getWebMinNativeVersion(): string {
  return (process.env.NEXT_PUBLIC_WEB_MIN_NATIVE_VERSION || "").trim();
}
