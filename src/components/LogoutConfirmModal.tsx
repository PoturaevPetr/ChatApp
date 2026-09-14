"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
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

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface LogoutConfirmContentProps {
  canConfirm: boolean;
  onClose: (e?: React.MouseEvent) => void;
  onConfirm: (e: React.MouseEvent) => void;
  centered?: boolean;
}

function LogoutConfirmContent({ canConfirm, onClose, onConfirm, centered = false }: LogoutConfirmContentProps) {
  return (
    <>
      <h2
        id="logout-modal-title"
        className={`mb-1 text-lg font-semibold tracking-tight text-foreground ${centered ? "text-center" : ""}`}
      >
        Выход из аккаунта
      </h2>
      <p className={`mb-5 text-sm leading-relaxed text-muted-foreground ${centered ? "text-center" : ""}`}>
        Вы уверены, что хотите выйти?
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={(e) => onClose(e)}
          className="flex-1 rounded-xl border border-border/90 bg-muted/15 py-3.5 font-medium text-foreground shadow-sm transition-all hover:bg-muted/35 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/25"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        >
          <LogOut size={18} aria-hidden />
          Выйти
        </button>
      </div>
    </>
  );
}

export function LogoutConfirmModal({ isOpen, onClose, onConfirm }: LogoutConfirmModalProps) {
  const { preferCenterModal } = useClientDeviceKind();
  const animMs = preferCenterModal ? CENTER_MODAL_ANIM_MS : BOTTOM_SHEET_ANIM_MS;
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
    }, animMs);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible || !canConfirm || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onConfirm();
    }, animMs);
  };

  if (!isOpen) return null;

  const contentProps = {
    canConfirm,
    onClose: handleClose,
    onConfirm: handleConfirm,
  };

  if (preferCenterModal) {
    return (
      <div
        className={centerModalRootClass}
        style={{ zIndex: 9999 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <div
          className={`${centerModalBackdropBaseClass} ${centerModalBackdropOpacityClass(isVisible, isExiting)}`}
          onClick={() => handleClose()}
          aria-hidden
        />
        <div
          className={`${centerModalPanelClass} ${centerModalPanelMotionClass(isVisible, isExiting)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <LogoutConfirmContent {...contentProps} centered />
        </div>
      </div>
    );
  }

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
        className={`${bottomSheetPanelClass} transition-transform ease-out ${
          isVisible && !isExiting ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          transitionDuration: `${BOTTOM_SHEET_ANIM_MS}ms`,
          ...bottomSheetPanelBottomStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={bottomSheetHandleClass} aria-hidden />
        <LogoutConfirmContent {...contentProps} />
      </div>
    </div>
  );
}
