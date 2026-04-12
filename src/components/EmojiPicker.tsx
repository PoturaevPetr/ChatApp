"use client";

import { useCallback, useRef } from "react";
import { Smile, X } from "lucide-react";

export const EMOJI_LIST = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂",
  "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛",
  "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
  "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉",
  "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤙", "💪",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
  "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨",
  "🔥", "⭐", "🌟", "💫", "✅", "❌", "❗", "❓", "‼️", "💬",
  "🎉", "🎊", "🎈", "🎁", "🏆", "👍", "👏", "🙌", "🤝", "💯",
];

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

/**
 * Полноширинная панель снизу (над строкой ввода), в духе экранной клавиатуры.
 */
export function EmojiKeyboardPanel({ open, onClose, onSelect }: EmojiKeyboardPanelProps) {
  const touchStartY = useRef<number | null>(null);

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
      className="w-full border-t border-white/10 bg-background/95 backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)] flex flex-col max-h-[min(40dvh,280px)] min-h-[160px]"
      role="dialog"
      aria-label="Выбор эмодзи"
    >
      <div
        className="relative flex min-h-[52px] shrink-0 items-center justify-center border-b border-border/60 px-3 py-2"
        onTouchStart={onHandleTouchStart}
        onTouchEnd={onHandleTouchEnd}
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/35" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Смайлы</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-1/2 z-[1] -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1">
        <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-10">
          {EMOJI_LIST.map((emoji, idx) => (
            <button
              key={`${idx}-${emoji}`}
              type="button"
              className="flex h-10 items-center justify-center rounded-lg text-xl hover:bg-muted/70 active:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/25"
              onClick={() => {
                onSelect(emoji);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
