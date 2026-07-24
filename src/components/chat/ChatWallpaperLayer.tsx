"use client";

import { useCallback, useEffect, useState } from "react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { resolveWallpaperLayerStyle } from "@/lib/chatWallpapers";
import {
  resolveEffectiveWallpaper,
  type ChatWallpaperScope,
} from "@/lib/chatWallpaperStorage";
import type { ChatWallpaperSelection } from "@/lib/chatWallpapers";

export const CHAT_WALLPAPER_CHANGED_EVENT = "chatapp:wallpaper-changed";

export function notifyWallpaperChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHAT_WALLPAPER_CHANGED_EVENT));
  }
}

export function ChatWallpaperLayer({ roomId }: { roomId: string | null }) {
  const isDark = useDarkMode();
  const [selection, setSelection] = useState<ChatWallpaperSelection>({ kind: "preset", presetId: "classic" });
  const [customUrl, setCustomUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const resolved = await resolveEffectiveWallpaper(roomId);
    setSelection(resolved.selection);
    setCustomUrl(resolved.customUrl);
  }, [roomId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(CHAT_WALLPAPER_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHAT_WALLPAPER_CHANGED_EVENT, onChange);
  }, [reload]);

  const style = resolveWallpaperLayerStyle(selection, isDark, customUrl);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden
      style={{
        ...style,
        backgroundRepeat: selection.kind === "custom" ? "no-repeat" : "repeat",
      }}
    />
  );
}

export type { ChatWallpaperScope };
