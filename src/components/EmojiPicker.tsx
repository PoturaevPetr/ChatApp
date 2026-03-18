"use client";

import { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";

const EMOJI_LIST = [
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

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ onSelect, className = "" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="Выбрать эмодзи"
      >
        <Smile size={22} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-2 z-50 grid grid-cols-10 gap-0.5">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-xl p-1.5 rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
