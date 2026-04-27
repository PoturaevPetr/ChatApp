"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  BOTTOM_SHEET_ANIM_MS,
  bottomSheetBackdropBaseClass,
  bottomSheetBackdropOpacityClass,
  bottomSheetHandleClass,
  bottomSheetPanelBottomStyle,
  bottomSheetPanelClass,
  bottomSheetRootClass,
} from "@/lib/bottomSheetModalClasses";

export function MobileUpdateModal({
  isOpen,
  title,
  message,
  latestVersion,
  isForced,
  isUpdating = false,
  progressPercent = null,
  updateError = null,
  onLater,
  onUpdate,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  latestVersion?: string | null;
  isForced: boolean;
  isUpdating?: boolean;
  progressPercent?: number | null;
  updateError?: string | null;
  onLater: () => void;
  onUpdate: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(start);
    }
    setIsVisible(false);
    setIsExiting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const closeSoft = () => {
    if (isForced || isExiting || isUpdating) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onLater();
    }, BOTTOM_SHEET_ANIM_MS);
  };

  return (
    <div className={bottomSheetRootClass} style={{ zIndex: 10040 }} role="dialog" aria-modal="true">
      <div
        className={`${bottomSheetBackdropBaseClass} ${bottomSheetBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={closeSoft}
        aria-hidden
      />
      <div
        className={`${bottomSheetPanelClass} transition-transform ease-out`}
        style={{
          transitionDuration: `${BOTTOM_SHEET_ANIM_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
          ...bottomSheetPanelBottomStyle,
        }}
      >
        <div className={bottomSheetHandleClass} aria-hidden />
        {!isForced ? (
          <button
            type="button"
            onClick={closeSoft}
            disabled={isUpdating}
            className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-muted/30"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground mb-1">{message}</p>
        {latestVersion ? (
          <p className="text-xs text-muted-foreground mb-5">Версия: {latestVersion}</p>
        ) : (
          <div className="mb-5" />
        )}
        {isUpdating ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {progressPercent !== null
              ? `Скачивание обновления: ${Math.max(0, Math.min(100, Math.round(progressPercent)))}%`
              : "Скачивание обновления..."}
          </div>
        ) : null}
        {updateError ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {updateError}
          </div>
        ) : null}
        <div className="flex gap-3">
          {!isForced ? (
            <button
              type="button"
              onClick={closeSoft}
              disabled={isUpdating}
              className="flex-1 rounded-xl border border-border/90 bg-muted/15 py-3.5 font-medium text-foreground shadow-sm transition-all hover:bg-muted/35 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              Позже
            </button>
          ) : null}
          <button
            type="button"
            onClick={onUpdate}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={18} aria-hidden />
            {isUpdating ? "Загрузка..." : "Обновить"}
          </button>
        </div>
      </div>
    </div>
  );
}

