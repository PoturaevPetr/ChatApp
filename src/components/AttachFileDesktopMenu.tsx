"use client";

import { Camera, FileUp, ImagePlus, MapPin } from "lucide-react";

interface AttachFileDesktopMenuProps {
  onChooseImage?: () => void;
  onUploadFile: () => void;
  onTakePhoto?: () => void;
  onShareLocation?: () => void;
  onClose: () => void;
}

const menuItemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30";

export function AttachFileDesktopMenu({
  onChooseImage,
  onUploadFile,
  onTakePhoto,
  onShareLocation,
  onClose,
}: AttachFileDesktopMenuProps) {
  const act = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
      {onChooseImage ? (
        <button type="button" className={menuItemClass} onClick={() => act(onChooseImage)}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <ImagePlus className="h-4 w-4" aria-hidden />
          </span>
          Фото
        </button>
      ) : null}
      {onTakePhoto ? (
        <button type="button" className={menuItemClass} onClick={() => act(onTakePhoto)}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <Camera className="h-4 w-4" aria-hidden />
          </span>
          Камера
        </button>
      ) : null}
      <button type="button" className={menuItemClass} onClick={() => act(onUploadFile)}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <FileUp className="h-4 w-4" aria-hidden />
        </span>
        Файл
      </button>
      {onShareLocation ? (
        <button type="button" className={menuItemClass} onClick={() => act(onShareLocation)}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          Геопозиция
        </button>
      ) : null}
    </div>
  );
}
