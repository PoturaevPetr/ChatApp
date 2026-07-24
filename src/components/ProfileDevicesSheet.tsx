"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMediaMinMd } from "@/hooks/useMediaMinMd";
import { DevicesPanel } from "@/components/DevicesPanel";
import {
  CENTER_MODAL_ANIM_MS,
  centerModalBackdropBaseClass,
  centerModalBackdropOpacityClass,
  centerModalPanelMotionClass,
  centerModalRootClass,
} from "@/lib/centerModalClasses";

const MODAL_Z = 10050;
const MOBILE_ANIM_MS = CENTER_MODAL_ANIM_MS;

const centerModalPanelTallClass =
  "relative flex w-full max-w-lg max-h-[min(90dvh,720px)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-card/85 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-out";

interface ProfileDevicesSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileDevicesSheet({ open, onClose }: ProfileDevicesSheetProps) {
  const isDesktop = useMediaMinMd();
  const animMs = isDesktop ? CENTER_MODAL_ANIM_MS : MOBILE_ANIM_MS;
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, animMs);
  };

  if (!open) return null;

  if (isDesktop) {
    return (
      <div
        className={centerModalRootClass}
        style={{ zIndex: MODAL_Z }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-devices-title"
      >
        <div
          className={`${centerModalBackdropBaseClass} ${centerModalBackdropOpacityClass(isVisible, isExiting)}`}
          onClick={handleClose}
          aria-hidden
        />
        <div
          className={`${centerModalPanelTallClass} ${centerModalPanelMotionClass(isVisible, isExiting)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-border/50 px-5 py-4">
            <h2 id="profile-devices-title" className="text-center text-lg font-semibold text-foreground">
              Устройства
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <DevicesPanel embedded />
          </div>
          <div className="shrink-0 border-t border-border/50 px-5 py-4">
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: MODAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-devices-title-mobile"
    >
      <div
        className={`flex h-full min-h-0 flex-col bg-background/95 backdrop-blur-xl transition-opacity duration-300 ease-out ${
          isVisible && !isExiting ? "opacity-100" : "opacity-0"
        }`}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <h2 id="profile-devices-title-mobile" className="text-lg font-semibold text-foreground">
            Устройства
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <DevicesPanel embedded />
        </div>
      </div>
    </div>
  );
}
