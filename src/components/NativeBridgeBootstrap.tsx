"use client";

import { useEffect, useState } from "react";
import {
  getKindredNativeInfo,
  getWebMinNativeVersion,
  isHostedInNativeShell,
  KINDRED_NATIVE_BRIDGE_VERSION,
  type KindredNativeCapability,
  type KindredNativeInfo,
} from "@/lib/kindredNativeBridge";
import { isVersionLess } from "@/lib/semverCompare";

const SHELL_CAPABILITIES: KindredNativeCapability[] = [
  "push",
  "camera",
  "filesystem",
  "secure_storage",
  "oauth",
  "meet_media",
  "edge_to_edge",
];

/**
 * При старте в оболочке: поднимает window.KindredNative из Capacitor App.getInfo(),
 * если shell ещё не inject'нул объект (типичный случай hosted URL).
 */
export function NativeBridgeBootstrap({ children }: { children: React.ReactNode }) {
  const [staleShell, setStaleShell] = useState(false);
  const [info, setInfo] = useState<KindredNativeInfo | null>(null);

  useEffect(() => {
    void import("@/lib/signalCryptoBootstrap")
      .then(({ ensureSignalCryptoReady }) => ensureSignalCryptoReady())
      .catch((e) => console.warn("[Signal] crypto bootstrap:", e));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let n = getKindredNativeInfo();

      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform() && !n) {
          const { App } = await import("@capacitor/app");
          const appInfo = await App.getInfo().catch(() => null);
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          n = {
            bridgeVersion: KINDRED_NATIVE_BRIDGE_VERSION,
            nativeVersion: (appInfo?.version || "").trim() || "0.0.0",
            platform,
            capabilities: SHELL_CAPABILITIES,
            hostedUiOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
          };
          window.KindredNative = n;
        }
      } catch {
        /* web */
      }

      if (cancelled) return;
      setInfo(n);

      if (!isHostedInNativeShell() && !n) return;

      const min = getWebMinNativeVersion();
      const nativeVer = n?.nativeVersion || "";
      if (min && nativeVer && isVersionLess(nativeVer, min)) {
        setStaleShell(true);
        console.warn(
          "[KindredNative] shell too old:",
          nativeVer,
          "< required",
          min,
          "— update APK/IPA for full features"
        );
      } else if (n) {
        console.info("[KindredNative]", n.platform, n.nativeVersion, n.capabilities);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {staleShell && (
        <div className="bg-amber-600 px-3 py-2 text-center text-xs text-white">
          Версия приложения устарела ({info?.nativeVersion}). Обновите Kindred из магазина — часть функций
          может быть недоступна.
        </div>
      )}
      {children}
    </>
  );
}
