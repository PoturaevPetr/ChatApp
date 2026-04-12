"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MessageSquareReply, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/stores/chatStore";
import { ChatMessageBubble } from "./ChatMessageBubble";

const GAP = 8;
/** Оценка высоты блока действий (ответить + опционально удалить + отступы). */
const MENU_HEIGHT_ESTIMATE = 140;
const EDGE = 8;

export type MessageActionsOverlayProps = {
  message: ChatMessage;
  anchorRect: DOMRect;
  onClose: () => void;
  onReply: () => void;
  onDelete: () => void;
  canDelete: boolean;
};

function computePlacement(anchorRect: DOMRect): "below" | "above" {
  if (typeof window === "undefined") return "below";
  const vh = window.innerHeight;
  const spaceBelow = vh - anchorRect.bottom - EDGE;
  const spaceAbove = anchorRect.top - EDGE;
  const need = MENU_HEIGHT_ESTIMATE;

  const fitsBelow = spaceBelow >= need;
  const fitsAbove = spaceAbove >= need;

  if (fitsBelow && fitsAbove) return "below";
  if (fitsBelow) return "below";
  if (fitsAbove) return "above";
  return spaceBelow >= spaceAbove ? "below" : "above";
}

export function MessageActionsOverlay({
  message,
  anchorRect,
  onClose,
  onReply,
  onDelete,
  canDelete,
}: MessageActionsOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** После закрытия меню WebKit иногда оставляет фокус на удалённой подложке или выделение — ломается скролл ленты. */
  useEffect(() => {
    return () => {
      window.getSelection()?.removeAllRanges();
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && !ae.isConnected) {
        ae.blur();
      }
    };
  }, []);

  const placement = useMemo(() => computePlacement(anchorRect), [anchorRect]);

  const isOwn = message.isOwn;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const menuMinW = Math.max(anchorRect.width, 200);
  const menuWidth = Math.min(Math.max(menuMinW, 220), vw - EDGE * 2);

  let menuLeft = isOwn ? anchorRect.right - menuWidth : anchorRect.left;
  menuLeft = Math.max(EDGE, Math.min(menuLeft, vw - menuWidth - EDGE));

  const bubbleStyle: CSSProperties = {
    position: "fixed",
    top: Math.max(EDGE, anchorRect.top),
    zIndex: 120,
    ...(isOwn
      ? { right: Math.max(EDGE, vw - anchorRect.right) }
      : { left: Math.max(EDGE, anchorRect.left) }),
  };

  const maxHBelow = Math.max(100, vh - anchorRect.bottom - GAP - EDGE);
  const maxHAbove = Math.max(100, anchorRect.top - GAP - EDGE);

  const menuStyle: CSSProperties =
    placement === "below"
      ? {
          position: "fixed",
          top: anchorRect.bottom + GAP,
          left: menuLeft,
          width: menuWidth,
          maxHeight: maxHBelow,
          zIndex: 125,
        }
      : {
          position: "fixed",
          bottom: vh - anchorRect.top + GAP,
          left: menuLeft,
          width: menuWidth,
          maxHeight: maxHAbove,
          zIndex: 125,
        };

  const node = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-md cursor-default"
        aria-label="Закрыть меню сообщения"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[115]">
        <div className="pointer-events-auto" style={bubbleStyle}>
          <ChatMessageBubble
            message={message}
            interactive={false}
            anchorBox={{ width: anchorRect.width, height: anchorRect.height }}
          />
        </div>
      </div>
      <div
        className="flex flex-col gap-0.5 overflow-y-auto rounded-xl border border-white/15 bg-background/95 px-2 py-2 shadow-xl backdrop-blur-xl"
        style={menuStyle}
        role="menu"
        aria-label="Действия над сообщением"
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
          onClick={() => {
            onReply();
            onClose();
          }}
        >
          <MessageSquareReply className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          Ответить
        </button>
        {canDelete ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/15 focus:outline-none focus:bg-destructive/15"
            onClick={() => {
              onDelete();
            }}
          >
            <Trash2 className="h-5 w-5 shrink-0 text-destructive" strokeWidth={2.25} aria-hidden />
            Удалить
          </button>
        ) : null}
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
