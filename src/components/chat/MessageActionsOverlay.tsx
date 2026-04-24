"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Copy, ExternalLink, MessageSquareReply, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/stores/chatStore";
import { CHAT_REACTION_EMOJIS } from "@/lib/chatReactionEmojis";
import { openUrlInSystemBrowser } from "@/lib/openExternalUrl";
import { getMessagePlainText } from "@/utils/chatUtils";
import { getFirstOpenableUrlFromMessageContent } from "@/utils/messageLinkUtils";
import { ChatMessageBubble } from "./ChatMessageBubble";

const GAP = 8;
/** Оценка высоты: действия + реакции (с запасом под развёрнутую сетку) и зазор между блоками. */
const MENU_HEIGHT_ESTIMATE = 420;
const EDGE = 8;

export type MessageActionsOverlayProps = {
  message: ChatMessage;
  anchorRect: DOMRect;
  onClose: () => void;
  onReply: () => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Реакции доступны только в комнате и для сообщения с серверным id. */
  roomId: string | null;
  canReact: boolean;
  onPickReaction: (emoji: string) => void;
};

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

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
  roomId,
  canReact,
  onPickReaction,
}: MessageActionsOverlayProps) {
  const [reactionsExpanded, setReactionsExpanded] = useState(false);

  /** Копирование для текста и геопозиции (координаты), не для вложений-фото/видео/аудио. */
  const plainText = useMemo(() => {
    if (message.content.type !== "text" && message.content.type !== "location") return "";
    return getMessagePlainText(message.content).trim();
  }, [message.content]);
  const canCopy = plainText.length > 0;
  const openableUrl = useMemo(() => getFirstOpenableUrlFromMessageContent(message.content), [message.content]);
  const canOpenLink = Boolean(openableUrl);

  const handleCopy = useCallback(async () => {
    if (!canCopy) return;
    if (message.content.type !== "text" && message.content.type !== "location") return;
    const ok = await copyToClipboard(getMessagePlainText(message.content));
    if (ok) onClose();
  }, [canCopy, message.content, onClose]);

  const handleOpenLink = useCallback(async () => {
    if (!openableUrl) return;
    await openUrlInSystemBrowser(openableUrl);
    onClose();
  }, [openableUrl, onClose]);

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
        className="flex min-h-0 flex-col gap-2.5 overflow-y-auto bg-transparent p-0 shadow-none"
        style={menuStyle}
        aria-label="Меню сообщения"
      >
        <div
          className="shrink-0 rounded-xl border border-white/15 bg-background/95 px-2 py-2 shadow-xl backdrop-blur-xl"
          role="menu"
          aria-label="Действия над сообщением"
        >
          <div className="flex flex-col gap-0.5">
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
            {canCopy ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                Копировать
              </button>
            ) : null}
            {canOpenLink ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
                onClick={() => void handleOpenLink()}
              >
                <ExternalLink className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                Перейти
              </button>
            ) : null}
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
        </div>
        {canReact && roomId ? (
          <div
            className="shrink-0 rounded-xl border border-white/15 bg-background/95 px-2 py-2 shadow-xl backdrop-blur-xl"
            role="group"
            aria-label="Реакция на сообщение"
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Реакция</p>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-0"
                aria-expanded={reactionsExpanded}
                aria-controls="message-reaction-picker"
                aria-label={reactionsExpanded ? "Свернуть список реакций" : "Показать все реакции"}
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionsExpanded((v) => !v);
                }}
              >
                {reactionsExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
            </div>
            <div
              id="message-reaction-picker"
              className={
                reactionsExpanded
                  ? "grid grid-cols-5 gap-0.5 px-0.5"
                  : "flex max-w-full gap-0.5 overflow-x-auto overflow-y-hidden px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              }
              role="list"
              aria-label="Выбор эмодзи"
            >
              {CHAT_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="listitem"
                  className="flex h-9 w-9 shrink-0 items-center justify-center justify-self-center rounded-lg text-xl leading-none hover:bg-white/10 active:scale-95 focus:outline-none focus:bg-white/10 dark:hover:bg-white/10"
                  onClick={() => {
                    onPickReaction(emoji);
                    onClose();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
