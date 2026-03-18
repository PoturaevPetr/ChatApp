"use client";

import { useEffect, useState } from "react";
import { Camera, Upload } from "lucide-react";

interface AttachFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onUploadFile: () => void;
}

const ANIMATION_MS = 300;

export function AttachFileModal({ isOpen, onClose, onTakePhoto, onUploadFile }: AttachFileModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [canAct, setCanAct] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setCanAct(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      const allowAct = setTimeout(() => setCanAct(true), 400);
      return () => {
        cancelAnimationFrame(start);
        clearTimeout(allowAct);
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

  const handleTakePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible || !canAct) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
      onTakePhoto();
    }, ANIMATION_MS);
  };

  const handleUploadFile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible || !canAct) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
      onUploadFile();
    }, ANIMATION_MS);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attach-modal-title"
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
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
        className="relative w-full bg-card border-t border-border rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-transform ease-out"
        style={{
          transitionDuration: `${ANIMATION_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <div className="flex justify-center mb-5">
          <span className="w-10 h-1 rounded-full bg-muted-foreground/30" aria-hidden />
        </div>
        <h2 id="attach-modal-title" className="text-xl font-semibold text-foreground text-center mb-1">
          Прикрепить файл
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Выберите способ
        </p>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={handleTakePhoto}
            className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/30 active:scale-[0.99] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-card text-left"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Camera size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block font-medium text-foreground">Сделать снимок</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Камера устройства</span>
            </div>
          </button>
          <button
            type="button"
            onClick={handleUploadFile}
            className="flex items-center gap-4 w-full p-4 rounded-2xl border border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/30 active:scale-[0.99] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-card text-left"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Upload size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block font-medium text-foreground">Загрузить с диска</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Фото или любой файл</span>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={(e) => handleClose(e)}
          className="w-full mt-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
