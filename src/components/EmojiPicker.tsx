"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Smile, X } from "lucide-react";
import Picker from "@emoji-mart/react";
import type { EmojiMartData } from "@emoji-mart/data";

function subscribeDarkMode(onChange: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(onChange);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getDarkModeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getDarkModeServerSnapshot() {
  return false;
}

type PickerPayload = {
  data: EmojiMartData;
  i18n: Record<string, unknown>;
};

interface EmojiKeyboardTriggerProps {
  open: boolean;
  onPress: () => void;
  className?: string;
}

/** Кнопка переключения панели эмодзи (как переключение на клавиатуру). */
export function EmojiKeyboardTrigger({ open, onPress, className = "" }: EmojiKeyboardTriggerProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={open ? "Закрыть эмодзи" : "Открыть эмодзи"}
      aria-expanded={open}
      className={`rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        open
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      } ${className}`}
    >
      <Smile size={22} />
    </button>
  );
}

interface EmojiKeyboardPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

type EmojiSelectPayload = {
  native?: string;
  skins?: { native?: string }[];
};

function nativeFromEmojiMart(emoji: EmojiSelectPayload): string {
  const fromSkin = emoji.skins?.[0]?.native;
  if (typeof fromSkin === "string" && fromSkin) return fromSkin;
  if (typeof emoji.native === "string" && emoji.native) return emoji.native;
  return "";
}

/**
 * Полноширинная панель под строкой ввода чата (в духе экранной клавиатуры).
 * Набор эмодзи — [Emoji Mart](https://github.com/missive/emoji-mart) (@emoji-mart/data + @emoji-mart/react).
 */
export function EmojiKeyboardPanel({ open, onClose, onSelect }: EmojiKeyboardPanelProps) {
  const touchStartY = useRef<number | null>(null);
  const [payload, setPayload] = useState<PickerPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isDark = useSyncExternalStore(subscribeDarkMode, getDarkModeSnapshot, getDarkModeServerSnapshot);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadError(null);
    void Promise.all([
      import("@emoji-mart/data"),
      import("@emoji-mart/data/i18n/ru.json"),
    ])
      .then(([dataMod, i18nMod]) => {
        if (cancelled) return;
        setPayload({
          data: dataMod.default as EmojiMartData,
          i18n: i18nMod.default as Record<string, unknown>,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Не удалось загрузить набор эмодзи");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const onHandleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartY.current;
      touchStartY.current = null;
      if (start == null) return;
      const end = e.changedTouches[0]?.clientY;
      if (end != null && end - start > 48) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="flex max-h-[min(40dvh,320px)] min-h-[160px] w-full flex-col border-t border-white/10 bg-background/95 shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-xl"
      role="dialog"
      aria-label="Выбор эмодзи"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-1 pb-1 pt-0">
        {loadError ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{loadError}</p>
        ) : !payload ? (
          <div className="flex h-[min(36dvh,260px)] min-h-[180px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            Загрузка…
          </div>
        ) : (
          <div className="emoji-mart-host h-[min(36dvh,280px)] min-h-[180px] w-full max-w-full">
            <Picker
              data={payload.data}
              i18n={payload.i18n}
              locale="ru"
              theme={isDark ? "dark" : "light"}
              set="native"
              onEmojiSelect={(emoji: EmojiSelectPayload) => {
                const native = nativeFromEmojiMart(emoji);
                if (native) onSelect(native);
              }}
              previewPosition="none"
              searchPosition="sticky"
              navPosition="bottom"
              dynamicWidth
              maxFrequentRows={3}
              skinTonePosition="search"
              perLine={8}
              emojiButtonSize={36}
              emojiSize={24}
            />
          </div>
        )}
      </div>
    </div>
  );
}
