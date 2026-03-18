"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ANIMATION_MS = 300;

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
  }, [isOpen]);

  const handleClose = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!isVisible) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, ANIMATION_MS);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible || !canConfirm) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onConfirm();
    }, ANIMATION_MS);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isVisible && !isExiting ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }}
        aria-hidden
      />
      <div
        className="relative w-full min-h-[18vh] bg-card border-t border-border rounded-t-2xl shadow-lg p-6 pb-[env(safe-area-inset-bottom)] transition-transform ease-out"
        style={{
          transitionDuration: `${ANIMATION_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <h2 id="logout-modal-title" className="text-lg font-semibold text-foreground mb-2">
          Выход из аккаунта
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Вы уверены, что хотите выйти?
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => handleClose(e)}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <LogOut size={20} />
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
