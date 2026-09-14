"use client";

import { useEffect, useState } from "react";
import { Bell, ImageIcon, ChevronRight } from "lucide-react";
import { useClientDeviceKind } from "@/hooks/useClientDeviceKind";
import {
  BOTTOM_SHEET_ANIM_MS,
  bottomSheetBackdropBaseClass,
  bottomSheetBackdropOpacityClass,
  bottomSheetHandleClass,
  bottomSheetPanelBottomStyle,
  bottomSheetPanelClass,
  bottomSheetRootClass,
} from "@/lib/bottomSheetModalClasses";
import {
  CENTER_MODAL_ANIM_MS,
  centerModalBackdropBaseClass,
  centerModalBackdropOpacityClass,
  centerModalPanelClass,
  centerModalPanelMotionClass,
  centerModalRootClass,
} from "@/lib/centerModalClasses";

interface ChatSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  notificationsBusy?: boolean;
  onOpenWallpaperPicker: () => void;
}

interface ChatSettingsContentProps {
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  notificationsBusy: boolean;
  onClose: () => void;
  closeThenOpenWallpaper: () => void;
}

function ChatSettingsContent({
  notificationsEnabled,
  onNotificationsChange,
  notificationsBusy,
  onClose,
  closeThenOpenWallpaper,
}: ChatSettingsContentProps) {
  return (
    <>
      <h2 id="chat-settings-title" className="mb-4 text-center text-lg font-semibold text-foreground">
        Настройки чата
      </h2>

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-foreground">
            <Bell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Уведомления
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-primary"
            checked={notificationsEnabled}
            disabled={notificationsBusy}
            onChange={(e) => onNotificationsChange(e.target.checked)}
            aria-label="Уведомления в этом чате"
          />
        </label>

        <button
          type="button"
          onClick={closeThenOpenWallpaper}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Фон чата
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        Закрыть
      </button>
    </>
  );
}

export function ChatSettingsSheet({
  open,
  onClose,
  notificationsEnabled,
  onNotificationsChange,
  notificationsBusy = false,
  onOpenWallpaperPicker,
}: ChatSettingsSheetProps) {
  const { preferCenterModal } = useClientDeviceKind();
  const animMs = preferCenterModal ? CENTER_MODAL_ANIM_MS : BOTTOM_SHEET_ANIM_MS;
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setIsExiting(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(start);
    }
    setIsVisible(false);
    setIsExiting(false);
  }, [open]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, animMs);
  };

  const closeThenOpenWallpaper = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
      onOpenWallpaperPicker();
    }, animMs);
  };

  if (!open) return null;

  const contentProps = {
    notificationsEnabled,
    onNotificationsChange,
    notificationsBusy,
    onClose: handleClose,
    closeThenOpenWallpaper,
  };

  if (preferCenterModal) {
    return (
      <div
        className={centerModalRootClass}
        style={{ zIndex: 10050 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-settings-title"
      >
        <div
          className={`${centerModalBackdropBaseClass} ${centerModalBackdropOpacityClass(isVisible, isExiting)}`}
          onClick={handleClose}
          aria-hidden
        />
        <div
          className={`${centerModalPanelClass} ${centerModalPanelMotionClass(isVisible, isExiting)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ChatSettingsContent {...contentProps} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={bottomSheetRootClass}
      style={{ zIndex: 10050 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-settings-title"
    >
      <div
        className={`${bottomSheetBackdropBaseClass} ${bottomSheetBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={handleClose}
        aria-hidden
      />
      <div
        className={`${bottomSheetPanelClass} transition-transform duration-300 ease-out ${
          isVisible && !isExiting ? "translate-y-0" : "translate-y-full"
        }`}
        style={bottomSheetPanelBottomStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={bottomSheetHandleClass} />
        <ChatSettingsContent {...contentProps} />
      </div>
    </div>
  );
}
