"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { openUrlInSystemBrowser } from "@/lib/openExternalUrl";
import { downloadAndInstallAndroidApk } from "@/lib/nativeAppUpdate";
import { checkMobileUpdateVersion, type MobileVersionCheckResponse } from "@/services/mobileUpdateApi";
import { MobileUpdateModal } from "@/components/MobileUpdateModal";
import { isVersionLess } from "@/lib/semverCompare";

const DISMISS_KEY = "chatapp_mobile_update_dismiss_v1";

type DismissState = {
  versionTag: string;
  dismissedAt: number;
};

function currentPlatform(): "android" | "ios" | null {
  const p = Capacitor.getPlatform();
  if (p === "android" || p === "ios") return p;
  return null;
}

async function readDismissState(): Promise<DismissState | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: DISMISS_KEY });
      return value ? (JSON.parse(value) as DismissState) : null;
    }
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as DismissState) : null;
  } catch {
    return null;
  }
}

async function writeDismissState(state: DismissState): Promise<void> {
  const raw = JSON.stringify(state);
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: DISMISS_KEY, value: raw });
  } else {
    localStorage.setItem(DISMISS_KEY, raw);
  }
}

export function MobileUpdateGate() {
  const [updateInfo, setUpdateInfo] = useState<MobileVersionCheckResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isNative) return;
    cancelledRef.current = false;

    const runCheck = async () => {
      const platform = currentPlatform();
      if (!platform) return;
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      const info = await App.getInfo().catch(() => null);
      const appVersion = (info?.version || "").trim();
      if (!appVersion) return;

      let result: MobileVersionCheckResponse;
      try {
        result = await checkMobileUpdateVersion(tokens.access_token, {
          platform,
          app_version: appVersion,
        });
      } catch {
        return;
      }
      if (cancelledRef.current) return;

      if (!result.has_update) {
        setUpdateInfo(null);
        setOpen(false);
        return;
      }

      const latest = (result.latest_version || "").trim();
      if (latest && !isVersionLess(appVersion, latest)) {
        setUpdateInfo(null);
        setOpen(false);
        return;
      }

      const versionTag =
        `${platform}:${result.latest_version ?? ""}:${result.min_supported_version ?? ""}`.trim();
      if (!result.is_forced) {
        const dismiss = await readDismissState();
        const remindAfterHours = Math.max(1, result.remind_after_hours ?? 24);
        const remindAfterMs = remindAfterHours * 60 * 60 * 1000;
        if (
          dismiss &&
          dismiss.versionTag === versionTag &&
          Date.now() - dismiss.dismissedAt < remindAfterMs
        ) {
          return;
        }
      }
      if (cancelledRef.current) return;
      setUpdateInfo(result);
      setOpen(true);
    };

    void runCheck();

    let resumeListener: { remove: () => Promise<void> } | undefined;
    void App.addListener("resume", () => {
      void runCheck();
    }).then((handle) => {
      resumeListener = handle;
    });

    return () => {
      cancelledRef.current = true;
      void resumeListener?.remove();
    };
  }, [isNative]);

  const title = useMemo(
    () => updateInfo?.title || (updateInfo?.is_forced ? "Требуется обновление" : "Доступно обновление"),
    [updateInfo],
  );
  const message = useMemo(
    () =>
      updateInfo?.message ||
      (updateInfo?.is_forced
        ? "Текущая версия больше не поддерживается. Обновите приложение, чтобы продолжить."
        : "Доступна новая версия приложения. Рекомендуем обновиться."),
    [updateInfo],
  );

  if (!isNative || !updateInfo) return null;

  return (
    <MobileUpdateModal
      isOpen={open}
      title={title}
      message={message}
      latestVersion={updateInfo.latest_version}
      isForced={Boolean(updateInfo.is_forced)}
      onLater={() => {
        if (isUpdating) return;
        const platform = currentPlatform();
        if (platform) {
          const versionTag =
            `${platform}:${updateInfo.latest_version ?? ""}:${updateInfo.min_supported_version ?? ""}`.trim();
          void writeDismissState({ versionTag, dismissedAt: Date.now() });
        }
        setOpen(false);
      }}
      isUpdating={isUpdating}
      progressPercent={progressPercent}
      updateError={updateError}
      onUpdate={() => {
        if (!updateInfo.download_url || isUpdating) return;
        const platform = currentPlatform();
        setUpdateError(null);

        if (platform === "android" && Capacitor.isNativePlatform()) {
          setIsUpdating(true);
          setProgressPercent(null);
          void downloadAndInstallAndroidApk(updateInfo.download_url, (received, total) => {
            if (total > 0) {
              setProgressPercent((received / total) * 100);
            }
          })
            .catch((e) => {
              setUpdateError(e instanceof Error ? e.message : "Не удалось скачать обновление");
            })
            .finally(() => {
              setIsUpdating(false);
            });
          return;
        }

        void openUrlInSystemBrowser(updateInfo.download_url);
        if (!updateInfo.is_forced) {
          setOpen(false);
        }
      }}
    />
  );
}
