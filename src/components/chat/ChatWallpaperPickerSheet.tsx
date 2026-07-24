"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import {
  BOTTOM_SHEET_ANIM_MS,
  bottomSheetBackdropBaseClass,
  bottomSheetBackdropOpacityClass,
  bottomSheetHandleClass,
  bottomSheetPanelBottomStyle,
  bottomSheetRootClass,
} from "@/lib/bottomSheetModalClasses";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  CHAT_WALLPAPER_PRESETS,
  DEFAULT_CHAT_WALLPAPER_PRESET_ID,
  presetPreviewStyle,
  type ChatWallpaperSelection,
} from "@/lib/chatWallpapers";
import {
  readCustomWallpaperUrl,
  readWallpaperSelection,
  resetWallpaper,
  resizeImageFileToDataUrl,
  writeWallpaperCustom,
  writeWallpaperPreset,
  type ChatWallpaperScope,
} from "@/lib/chatWallpaperStorage";
import { notifyWallpaperChanged } from "@/components/chat/ChatWallpaperLayer";

interface ChatWallpaperPickerSheetProps {
  open: boolean;
  onClose: () => void;
  roomId: string | null;
}

export function ChatWallpaperPickerSheet({ open, onClose, roomId }: ChatWallpaperPickerSheetProps) {
  const isDark = useDarkMode();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [selection, setSelection] = useState<ChatWallpaperSelection>({
    kind: "preset",
    presetId: DEFAULT_CHAT_WALLPAPER_PRESET_ID,
  });
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scope: ChatWallpaperScope = applyToAll ? "global" : "room";

  const loadCurrent = useCallback(async () => {
    const sel = await readWallpaperSelection("room", roomId);
    setSelection(sel);
    if (sel.kind === "custom") {
      setCustomPreview(await readCustomWallpaperUrl(sel.storageKey));
    } else {
      setCustomPreview(null);
    }
  }, [roomId]);

  useEffect(() => {
    if (open) {
      setIsExiting(false);
      void loadCurrent();
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(start);
    }
    setIsVisible(false);
    setIsExiting(false);
  }, [open, loadCurrent]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, BOTTOM_SHEET_ANIM_MS);
  };

  const pickPreset = async (presetId: string) => {
    setBusy(true);
    try {
      await writeWallpaperPreset(scope, roomId, presetId);
      setSelection({ kind: "preset", presetId });
      setCustomPreview(null);
      notifyWallpaperChanged();
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      const sel = await writeWallpaperCustom(scope, roomId, dataUrl);
      setSelection(sel);
      setCustomPreview(dataUrl);
      notifyWallpaperChanged();
    } catch (e) {
      console.warn("wallpaper upload failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await resetWallpaper(scope, roomId);
      setSelection({ kind: "preset", presetId: DEFAULT_CHAT_WALLPAPER_PRESET_ID });
      setCustomPreview(null);
      notifyWallpaperChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const isCustomActive = selection.kind === "custom";

  return (
    <div
      className={bottomSheetRootClass}
      style={{ zIndex: 10060 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-wallpaper-title"
    >
      <div
        className={`${bottomSheetBackdropBaseClass} ${bottomSheetBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={handleClose}
        aria-hidden
      />
      <div
        className={`relative w-full min-w-0 max-w-none overflow-hidden rounded-t-[1.35rem] border-t border-border/80 bg-card shadow-[0_-10px_44px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.48)] flex max-h-[min(85dvh,560px)] flex-col px-5 pt-2 transition-transform duration-300 ease-out ${
          isVisible && !isExiting ? "translate-y-0" : "translate-y-full"
        }`}
        style={bottomSheetPanelBottomStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={bottomSheetHandleClass} />
        <h2 id="chat-wallpaper-title" className="mb-1 text-center text-lg font-semibold text-foreground">
          Фон чата
        </h2>
        <p className="mb-3 text-center text-xs text-muted-foreground">Выберите узор или загрузите своё фото</p>

        <label className="mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          Применить ко всем чатам
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
            {CHAT_WALLPAPER_PRESETS.map((preset) => {
              const active = selection.kind === "preset" && selection.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void pickPreset(preset.id)}
                  className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    active ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/40"
                  }`}
                  style={presetPreviewStyle(preset, isDark)}
                  title={preset.label}
                >
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1.5 pt-6 text-[10px] font-medium text-white">
                    {preset.label}
                  </span>
                  {active ? (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className={`relative flex aspect-[3/4] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                isCustomActive ? "border-primary ring-2 ring-primary/30" : "border-border/70 hover:border-primary/40"
              }`}
              style={
                isCustomActive && customPreview
                  ? {
                      backgroundImage: `url("${customPreview}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { backgroundColor: "hsl(var(--muted) / 0.35)" }
              }
            >
              {!isCustomActive || !customPreview ? (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
                  <span className="px-1 text-center text-[10px] font-medium text-muted-foreground">Своё фото</span>
                </>
              ) : (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1.5 pt-6 text-[10px] font-medium text-white">
                  Своё фото
                </span>
              )}
              {isCustomActive ? (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />

        <div className="mt-2 flex shrink-0 gap-2 border-t border-border/50 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReset()}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50"
          >
            По умолчанию
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                …
              </span>
            ) : (
              "Готово"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
