"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Loader2, Phone } from "lucide-react";
import type { ChatMessage, ReplyTo } from "@/stores/chatStore";
import { formatMeetCallLogLabel, formatMessageClock, getMessagePreviewText } from "@/utils/chatUtils";
import { MessageBody } from "./ChatMessageBody";
import {
  getMessageBubbleClassName,
  type MessageBubbleLayout,
} from "./chatMessageBubbleClassName";

const SWIPE_THRESHOLD = 50;
const MAX_DRAG_PX = 72;
const LOCK_RATIO = 1.2;
const AXIS_LOCK_PX = 12;
const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE_CANCEL = 14;

export function OutgoingReceiptTicks({
  status,
  variant = "onPrimary",
}: {
  status: ChatMessage["status"];
  /** onClear — пузырёк без primary-фона (круглое видео). */
  variant?: "onPrimary" | "onClear";
}) {
  const stroke = variant === "onClear" ? "text-primary/85" : "text-primary-foreground/85";
  const single = variant === "onClear" ? "text-primary/75" : "text-primary-foreground/75";
  if (status === "read") {
    return (
      <span
        className="relative inline-flex h-3.5 w-[18px] shrink-0"
        title="Прочитано"
        aria-label="Прочитано"
      >
        <Check className={`absolute left-0 top-0 h-3.5 w-3.5 ${stroke}`} strokeWidth={2.5} />
        <Check className={`absolute left-[5px] top-0 h-3.5 w-3.5 ${stroke}`} strokeWidth={2.5} />
      </span>
    );
  }
  const label = status === "sent" ? "Отправка" : "Доставлено";
  return (
    <span title={label} aria-label={label}>
      <Check className={`h-3.5 w-3.5 shrink-0 ${single}`} strokeWidth={2.5} />
    </span>
  );
}

export type ChatMessageBubbleProps = {
  message: ChatMessage;
  /** Свайп «ответить»; не нужен при interactive=false. */
  onSwipeReply?: (replyTo: ReplyTo) => void;
  /** false — только отображение (клон в оверлее). */
  interactive?: boolean;
  /** Остальные сообщения под меню долгого нажатия. */
  dimmed?: boolean;
  /** Скрыть пузырёк в ленте, место сохраняется (показан клон в оверлее). */
  hideVisual?: boolean;
  /** Долгое нажатие: передать rect пузырька для позиционирования меню. */
  onLongPress?: (rect: DOMRect) => void;
  /** Точные width/height как у пузырька в ленте (оверлей долгого нажатия). */
  anchorBox?: { width: number; height: number };
  /** Аватар участника для строки реакций (data URL или https). */
  resolveReactionAvatar?: (userId: string) => string | null | undefined;
  /** Тап по чипу реакции: эмодзи на чипе и userId автора реакции (комната, серверный id сообщения). */
  onReactionChipClick?: (emoji: string, chipUserId: string) => void;
  /** Для подписи чипа (своя / чужая реакция). */
  currentUserId?: string | null;
  /** Групповой чат: у входящих — аватар отправителя слева от пузырька. */
  groupIncomingAvatar?: boolean;
};

type DragSession = {
  startX: number;
  startY: number;
  active: boolean;
  lockedHorizontal: boolean;
  replyTo: ReplyTo | null;
};

const emptySession = (): DragSession => ({
  startX: 0,
  startY: 0,
  active: false,
  lockedHorizontal: false,
  replyTo: null,
});

function tryLockOrCancel(dx: number, dy: number): "locked" | "cancel" | "wait" {
  if (Math.abs(dx) >= AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy) * LOCK_RATIO) return "locked";
  if (Math.abs(dy) >= AXIS_LOCK_PX && Math.abs(dy) > Math.abs(dx)) return "cancel";
  return "wait";
}

export function ChatMessageBubble({
  message,
  onSwipeReply,
  interactive = true,
  dimmed = false,
  hideVisual = false,
  onLongPress,
  anchorBox,
  resolveReactionAvatar,
  onReactionChipClick,
  currentUserId,
  groupIncomingAvatar = false,
}: ChatMessageBubbleProps) {
  const isAudioMessage =
    message.content.type === "file" && message.content.file.mimeType.startsWith("audio/");
  const isVideoMessage =
    message.content.type === "file" && message.content.file.mimeType.startsWith("video/");
  const isImageMessage =
    message.content.type === "file" && message.content.file.mimeType.toLowerCase().startsWith("image/");
  /** Круг с % — только для «тяжёлых» файлов; не для фото, аудио и видео (у видео свой прогресс в плеере). */
  const showFileUploadPercentRing =
    message.isOwn &&
    message.isUploading &&
    message.content.type === "file" &&
    !isVideoMessage &&
    !isAudioMessage &&
    !isImageMessage;

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sessionRef = useRef<DragSession>(emptySession());
  const bubbleRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef(message);
  messageRef.current = message;
  const onSwipeReplyRef = useRef(onSwipeReply);
  onSwipeReplyRef.current = onSwipeReply;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchActiveRef = useRef(false);
  const longPressFiredRef = useRef(false);
  const longPressCancelledRef = useRef(false);

  const replyToPayload: ReplyTo = {
    id: message.id,
    preview: getMessagePreviewText(message.content, 50, currentUserId),
  };

  const clampDrag = (dx: number) => Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, dx));

  if (message.content.type === "call_log") {
    const label = formatMeetCallLogLabel(currentUserId, message.content);
    return (
      <div
        className={
          `flex justify-center px-3 py-1.5 ` +
          (dimmed ? "blur-[3px] opacity-[0.4] pointer-events-none transition-[filter,opacity] duration-200" : "")
        }
      >
        <div className="inline-flex max-w-[min(100%,26rem)] items-center gap-2 rounded-full border border-border/55 bg-muted/55 px-3.5 py-1.5 text-center text-[13px] leading-snug text-muted-foreground shadow-sm dark:border-white/12 dark:bg-muted/45">
          <Phone className="h-3.5 w-3.5 shrink-0 opacity-85" strokeWidth={2.2} aria-hidden />
          <span>{label}</span>
          <span className="text-[10px] font-medium tabular-nums opacity-70">{formatMessageClock(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    sessionRef.current = emptySession();
    setIsDragging(false);
    setDragX(0);
  }, []);

  const fireLongPressIfNeeded = useCallback(() => {
    if (longPressCancelledRef.current || !onLongPressRef.current) return;
    const r = bubbleRef.current?.getBoundingClientRect();
    if (!r) return;
    longPressFiredRef.current = true;
    clearLongPressTimer();
    endDrag();
    sessionRef.current = emptySession();
    onLongPressRef.current(r);
  }, [clearLongPressTimer, endDrag]);

  useEffect(() => {
    if (!interactive) return;
    const el = bubbleRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      longPressFiredRef.current = false;
      longPressCancelledRef.current = false;
      touchActiveRef.current = true;
      clearLongPressTimer();
      if (onLongPressRef.current) {
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          if (!touchActiveRef.current || longPressCancelledRef.current) return;
          fireLongPressIfNeeded();
        }, LONG_PRESS_MS);
      }

      const t = e.touches[0];
      const m = messageRef.current;
      sessionRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        active: true,
        lockedHorizontal: false,
        replyTo: {
          id: m.id,
          preview: getMessagePreviewText(m.content, 50, currentUserId),
        },
      };
      setDragX(0);
      setIsDragging(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = sessionRef.current;
      if (!s.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;

      if (Math.abs(dx) > LONG_PRESS_MOVE_CANCEL || Math.abs(dy) > LONG_PRESS_MOVE_CANCEL) {
        longPressCancelledRef.current = true;
        clearLongPressTimer();
      }

      if (longPressFiredRef.current) return;

      if (!s.lockedHorizontal) {
        const r = tryLockOrCancel(dx, dy);
        if (r === "cancel") {
          endDrag();
          return;
        }
        if (r === "wait") return;
        s.lockedHorizontal = true;
        setIsDragging(true);
      }

      e.preventDefault();
      setDragX(clampDrag(dx));
    };

    const onTouchEnd = (e: TouchEvent) => {
      touchActiveRef.current = false;
      clearLongPressTimer();
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        endDrag();
        return;
      }
      const s = sessionRef.current;
      if (!s.active) return;
      const ch = e.changedTouches[0];
      const endX = ch?.clientX ?? s.startX;
      const endY = ch?.clientY ?? s.startY;
      const dx = endX - s.startX;
      const dy = endY - s.startY;
      const locked = s.lockedHorizontal;
      const rt = s.replyTo;
      endDrag();
      if (locked && rt && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        onSwipeReplyRef.current?.(rt);
      }
    };

    const onTouchCancel = () => {
      touchActiveRef.current = false;
      longPressCancelledRef.current = true;
      clearLongPressTimer();
      longPressFiredRef.current = false;
      endDrag();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      clearLongPressTimer();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [interactive, endDrag, clearLongPressTimer, fireLongPressIfNeeded]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();

    longPressFiredRef.current = false;
    longPressCancelledRef.current = false;
    clearLongPressTimer();

    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    if (onLongPressRef.current) {
      lpTimer = setTimeout(() => {
        lpTimer = null;
        if (longPressCancelledRef.current) return;
        fireLongPressIfNeeded();
      }, LONG_PRESS_MS);
    }

    sessionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      active: true,
      lockedHorizontal: false,
      replyTo: replyToPayload,
    };
    setDragX(0);
    setIsDragging(false);

    const onMove = (ev: MouseEvent) => {
      const s = sessionRef.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      if (Math.abs(dx) > LONG_PRESS_MOVE_CANCEL || Math.abs(dy) > LONG_PRESS_MOVE_CANCEL) {
        longPressCancelledRef.current = true;
        if (lpTimer != null) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      }

      if (longPressFiredRef.current) return;
      if (!s.active) return;

      if (!s.lockedHorizontal) {
        const r = tryLockOrCancel(dx, dy);
        if (r === "cancel") {
          endDrag();
          cleanup();
          return;
        }
        if (r === "wait") return;
        s.lockedHorizontal = true;
        setIsDragging(true);
      }
      setDragX(clampDrag(dx));
    };

    const onUp = (ev: MouseEvent) => {
      if (lpTimer != null) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        endDrag();
        cleanup();
        return;
      }
      const s = sessionRef.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      const locked = s.lockedHorizontal;
      const rt = s.replyTo;
      endDrag();
      cleanup();
      if (locked && rt && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        onSwipeReplyRef.current?.(rt);
      }
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const rowClass =
    `flex min-w-0 ${message.isOwn ? "justify-end" : "justify-start"}` +
    (dimmed ? " blur-[3px] opacity-[0.4] pointer-events-none transition-[filter,opacity] duration-200" : "") +
    /* Плейсхолдер под клоном в оверлее: invisible в WebKit часто всё ещё ловит тачи и рвёт скролл — отключаем hit-test. */
    (hideVisual ? " invisible pointer-events-none" : "");

  const rowStyle: CSSProperties | undefined = anchorBox
    ? { width: anchorBox.width, height: anchorBox.height, boxSizing: "border-box" }
    : undefined;

  const bubbleLayout: MessageBubbleLayout = isAudioMessage ? "audio" : isVideoMessage ? "video" : "text";
  const ownVideoClearBubble = Boolean(message.isOwn && isVideoMessage);
  const reactionChipsClickable =
    Boolean(interactive && onReactionChipClick && !message.id.startsWith("msg_"));
  const me = currentUserId?.trim().toLowerCase() ?? "";
  const showGroupSenderAvatar = Boolean(groupIncomingAvatar && !message.isOwn);
  const senderAvatarUrl = showGroupSenderAvatar ? (resolveReactionAvatar?.(message.senderId) ?? null) : null;

  const bubbleDiv = (
    <div
      ref={bubbleRef}
      className={getMessageBubbleClassName(message.isOwn, bubbleLayout, {
        fillAnchor: !!anchorBox,
        enclosedMaxWidth: showGroupSenderAvatar && !anchorBox,
      })}
      onMouseDown={interactive ? onMouseDown : undefined}
      style={{
        transform: anchorBox ? undefined : `translateX(${dragX}px)`,
        transition: anchorBox || isDragging ? "none" : "transform 0.2s ease-out",
        touchAction: interactive ? "pan-y" : undefined,
      }}
    >
      <MessageBody
          content={message.content}
          isOwn={message.isOwn}
          messageTimestamp={message.timestamp}
          videoUploadProgress={
            message.isOwn && isVideoMessage && message.isUploading ? (message.uploadProgress ?? 0) : undefined
          }
          immediateMediaLoad={Boolean(anchorBox)}
          messageId={message.id}
          sequencePlayback={interactive}
          viewerUserId={currentUserId}
        />
        {showFileUploadPercentRing ? (
          <div className="mt-2 flex flex-col items-center gap-1" aria-live="polite">
            <div className="relative flex h-[3.25rem] w-[3.25rem] items-center justify-center">
              <Loader2
                className={`pointer-events-none absolute h-[3.25rem] w-[3.25rem] animate-spin ${
                  message.isOwn ? "text-primary-foreground/22" : "text-foreground/20"
                }`}
                strokeWidth={1.2}
                aria-hidden
              />
              <svg className="absolute h-[3.25rem] w-[3.25rem] -rotate-90" viewBox="0 0 36 36" aria-hidden>
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  className={message.isOwn ? "text-primary-foreground/18" : "text-foreground/14"}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${Math.max(0.5, Math.min(100, Math.round(message.uploadProgress ?? 0)))} 100`}
                  className={message.isOwn ? "text-primary-foreground" : "text-primary"}
                />
              </svg>
              <span
                className={`relative text-[10px] font-bold tabular-nums leading-none ${
                  message.isOwn ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {Math.max(0, Math.min(100, Math.round(message.uploadProgress ?? 0)))}%
              </span>
            </div>
            <span
              className={`text-[10px] font-medium ${
                message.isOwn ? "text-primary-foreground/78" : "text-foreground/60"
              }`}
            >
              Загрузка файла…
            </span>
          </div>
        ) : null}
        {message.isOwn && message.uploadError ? (
          <p
            className={`mt-1 text-[10px] leading-snug ${
              ownVideoClearBubble ? "text-destructive" : message.isOwn ? "text-primary-foreground/85" : "text-destructive"
            }`}
          >
            Ошибка загрузки: {message.uploadError}
          </p>
        ) : null}
        <div className="mt-1.5 flex min-w-0 items-center gap-1">
          <p
            className={`text-[10px] font-medium tabular-nums ${
              ownVideoClearBubble
                ? "text-foreground/50"
                : message.isOwn
                  ? "text-primary-foreground/75"
                  : "text-foreground/55"
            }`}
          >
            {formatMessageClock(message.timestamp)}
          </p>
          {message.isOwn && message.isUploading && !message.uploadError && isImageMessage ? (
            <Loader2
              className={`h-3.5 w-3.5 shrink-0 animate-spin ${
                ownVideoClearBubble ? "text-primary/70" : "text-primary-foreground/75"
              }`}
              strokeWidth={2.5}
              aria-label="Загрузка изображения"
            />
          ) : null}
          {message.isOwn && !message.isUploading && !message.uploadError ? (
            <OutgoingReceiptTicks status={message.status} variant={ownVideoClearBubble ? "onClear" : "onPrimary"} />
          ) : null}
        </div>
        {(message.reactions?.length ?? 0) > 0 ? (
          <div
            className={`mt-1 flex min-w-0 flex-wrap gap-1 ${message.isOwn ? "justify-end" : "justify-start"}`}
            aria-label="Реакции"
          >
            {message.reactions!.map((r) => {
              const av = resolveReactionAvatar?.(r.userId);
              const chipClass = `inline-flex max-w-full items-center gap-1 rounded-full border pl-1 pr-2.5 py-1 shadow-sm ${
                message.isOwn
                  ? "border-primary-foreground/30 bg-primary-foreground/22 backdrop-blur-[2px]"
                  : "border-border/80 bg-muted/90 backdrop-blur-sm dark:border-white/12 dark:bg-muted/70"
              }`;
              const inner = (
                <>
                  {av ? (
                    <img
                      src={av}
                      alt=""
                      className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ring-1 ${
                        message.isOwn
                          ? "bg-primary-foreground/35 text-primary-foreground ring-primary-foreground/25"
                          : "bg-background/80 text-muted-foreground ring-border/60 dark:bg-background/40 dark:ring-white/10"
                      }`}
                    >
                      {(r.userId.slice(0, 1) || "?").toUpperCase()}
                    </span>
                  )}
                  <span className="text-[13px] leading-none tabular-nums">{r.emoji}</span>
                </>
              );
              if (reactionChipsClickable) {
                return (
                  <button
                    key={`${r.userId}-${r.emoji}`}
                    type="button"
                    className={`${chipClass} cursor-pointer text-left transition-opacity hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-0`}
                    aria-label={
                      me && r.userId.trim().toLowerCase() === me
                        ? `Снять реакцию ${r.emoji}`
                        : `Поставить реакцию ${r.emoji}`
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => onReactionChipClick?.(r.emoji, r.userId)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <span key={`${r.userId}-${r.emoji}`} className={chipClass}>
                  {inner}
                </span>
              );
            })}
          </div>
        ) : null}
    </div>
  );

  /**
   * Группа, чужое: `w-full` + max 92% только у голосовых — иначе ряд сжимается по узкому плееру.
   * Текст/файлы/видео — без `w-full`, ширина как у входящих в direct (ряд до max-w-[85%] по содержимому).
   */
  const groupIncomingRowClass = anchorBox
    ? "flex h-full w-full min-w-0 items-start gap-2"
    : isAudioMessage
      ? "flex w-full min-w-0 max-w-[92%] items-start gap-2"
      : "flex min-w-0 max-w-[85%] items-start gap-2";

  return (
    <div className={rowClass} style={rowStyle}>
      {showGroupSenderAvatar ? (
        <div className={groupIncomingRowClass}>
          <div className="pointer-events-none shrink-0 pt-0.5" aria-hidden>
            {senderAvatarUrl ? (
              <img
                src={senderAvatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover ring-1 ring-border/50 shadow-sm dark:ring-white/15"
                loading="lazy"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border/50 shadow-sm dark:ring-white/15">
                {(message.senderId.slice(0, 1) || "?").toUpperCase()}
              </span>
            )}
          </div>
          {anchorBox ? (
            <div className="relative min-h-0 min-w-0 flex-1">{bubbleDiv}</div>
          ) : (
            <div className="min-w-0 flex-1">{bubbleDiv}</div>
          )}
        </div>
      ) : anchorBox ? (
        <div className="relative h-full w-full min-w-0 shrink-0">{bubbleDiv}</div>
      ) : (
        bubbleDiv
      )}
    </div>
  );
}
