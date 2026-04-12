"use client";

import { useEffect, useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onUploadFile: () => void;
}

const ANIMATION_MS = 300;

export function AvatarUploadModal({ isOpen, onClose, onTakePhoto, onUploadFile }: AvatarUploadModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        cancelAnimationFrame(start);
      };
    } else {
      setIsVisible(false);
      setIsExiting(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, ANIMATION_MS);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-upload-modal-title"
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isVisible && !isExiting ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => handleClose()}
        aria-hidden
      />

      <div
        className="relative w-full min-h-[18vh] bg-card border-t border-border rounded-t-2xl shadow-lg p-6 pb-[env(safe-area-inset-bottom)] transition-transform ease-out"
        style={{
          transitionDuration: `${ANIMATION_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 id="avatar-upload-modal-title" className="text-lg font-semibold text-foreground">
            Аватарка
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Выберите способ загрузки аватара</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              handleClose();
              onTakePhoto();
            }}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <div className="flex items-center justify-center gap-2">
              <Camera size={18} />
              Сделать фото
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              handleClose();
              onUploadFile();
            }}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <div className="flex items-center justify-center gap-2">
              <ImageIcon size={18} />
              Загрузить файл
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

