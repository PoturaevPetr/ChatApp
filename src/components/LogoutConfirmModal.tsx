"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import {
  BOTTOM_SHEET_ANIM_MS,
  bottomSheetBackdropBaseClass,
  bottomSheetBackdropOpacityClass,
  bottomSheetHandleClass,
  bottomSheetPanelBottomStyle,
  bottomSheetPanelClass,
  bottomSheetRootClass,
} from "@/lib/bottomSheetModalClasses";

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({ isOpen, onClose, onConfirm }: LogoutConfirmModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setCanConfirm(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      const allowConfirm = setTimeout(() => setCanConfirm(true), 400);
      return () => {
        cancelAnimationFrame(start);
        clearTimeout(allowConfirm);
      };
    }
    setIsVisible(false);
    setIsExiting(false);
    setCanConfirm(false);
  }, [isOpen]);

  const handleClose = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, BOTTOM_SHEET_ANIM_MS);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible || !canConfirm || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onConfirm();
    }, BOTTOM_SHEET_ANIM_MS);
  };

  if (!isOpen) return null;

  return (
    <div
      className={bottomSheetRootClass}
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      <div
        className={`${bottomSheetBackdropBaseClass} ${bottomSheetBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }}
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
        <h2 id="logout-modal-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
          Выход из аккаунта
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground mb-5">
          Вы уверены, что хотите выйти?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => handleClose(e)}
            className="flex-1 rounded-xl border border-border/90 bg-muted/15 py-3.5 font-medium text-foreground shadow-sm transition-all hover:bg-muted/35 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            <LogOut size={18} aria-hidden />
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
