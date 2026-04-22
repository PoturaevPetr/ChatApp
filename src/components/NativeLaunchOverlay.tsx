"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const APP_LABEL = "Kindred";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
/** Минимум на экране запуска, чтобы не «мелькало» при быстрой гидрации. */
const MIN_VISIBLE_MS = 750;

type Phase = "idle" | "show" | "done";

/**
 * Белый экран запуска в WebView: иконка, индикатор загрузки, версия.
 * Нативный SplashScreen скрывается после первой отрисовки этого слоя.
 */
export function NativeLaunchOverlay() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [iconBroken, setIconBroken] = useState(false);
  const hidNativeSplash = useRef(false);

  useLayoutEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    setPhase("show");
  }, []);

  useLayoutEffect(() => {
    if (phase !== "show" || hidNativeSplash.current) return;
    hidNativeSplash.current = true;
    queueMicrotask(() => {
      void import("@capacitor/splash-screen")
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 140 }))
        .catch(() => {});
    });
  }, [phase]);

  useEffect(() => {
    if (phase !== "show") return;
    const t = window.setTimeout(() => setPhase("done"), MIN_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase !== "show") return null;

  return (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-white text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      aria-busy="true"
      aria-label="Загрузка приложения"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8">
        {!iconBroken ? (
          <img
            src="/launch-icon.png"
            alt=""
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-2xl object-cover shadow-md ring-1 ring-black/10"
            onError={() => setIconBroken(true)}
          />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-md">
            {APP_LABEL.slice(0, 1)}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 px-8 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-2">
        <div className="mx-auto h-1.5 w-[min(18rem,85vw)] overflow-hidden rounded-full bg-zinc-200">
          <div className="launch-progress-bar h-full w-2/5 rounded-full bg-primary" />
        </div>
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          Версия {VERSION}
        </p>
      </div>
    </div>
  );
}
