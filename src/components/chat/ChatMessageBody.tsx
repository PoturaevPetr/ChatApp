"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Pause, Captions, MoreVertical, Download } from "lucide-react";
import { createPortal } from "react-dom";
import type { ChatMessageContent, ChatMessageFile } from "@/stores/chatStore";
import { createImagePreview } from "@/utils/chatUtils";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import {
  fetchAttachmentBlob,
  getAttachmentTranscription,
  startAttachmentTranscription,
  waitForAttachmentTranscription,
} from "@/services/chatAttachmentsApi";
import { decryptAttachmentBytes } from "@/lib/fileCrypto";
import { dataUrlToBlob } from "@/lib/imageCompress";
import {
  fullImageAttachmentCacheKey,
  previewAttachmentCacheKey,
  registerBlobUrl,
  releaseBlobUrl,
  takeCachedBlobUrl,
} from "@/lib/attachmentMediaCache";

const MAX_PARALLEL_MEDIA_LOADS = 3;
let activeMediaLoads = 0;
const mediaWaiters: Array<{ priority: number; resolve: () => void }> = [];
let mediaDrainScheduled = false;

function scheduleMediaDrain() {
  if (mediaDrainScheduled) return;
  mediaDrainScheduled = true;
  queueMicrotask(() => {
    mediaDrainScheduled = false;
    drainMediaWaiters();
  });
}

/** Слоты отдаём сообщениям с большим priority (более свежий timestamp). */
function drainMediaWaiters() {
  mediaWaiters.sort((a, b) => b.priority - a.priority);
  while (activeMediaLoads < MAX_PARALLEL_MEDIA_LOADS && mediaWaiters.length > 0) {
    const w = mediaWaiters.shift()!;
    activeMediaLoads += 1;
    w.resolve();
  }
}

async function runWithMediaLoadLimit<T>(task: () => Promise<T>, priority = 0): Promise<T> {
  await new Promise<void>((resolve) => {
    mediaWaiters.push({ priority, resolve });
    scheduleMediaDrain();
  });
  try {
    return await task();
  } finally {
    activeMediaLoads = Math.max(0, activeMediaLoads - 1);
    drainMediaWaiters();
  }
}

function useNearViewport(targetRef: React.RefObject<Element | null>, rootMarginPx = 700): boolean {
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }
    let done = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (done) return;
        const hit = entries.some((entry) => entry.isIntersecting);
        if (hit) {
          done = true;
          setIsNear(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: `${rootMarginPx}px 0px ${rootMarginPx}px 0px`, threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetRef, rootMarginPx]);

  return isNear;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function FullscreenImageViewer({
  open,
  src,
  fileName,
  onClose,
}: {
  open: boolean;
  src: string;
  fileName: string;
  onClose: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setMenuOpen(false);
  }, [open]);

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
    >
      <div className="absolute top-4 right-4 z-[1000]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="h-10 w-10 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/70"
          aria-label="Действия с изображением"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 mt-2 min-w-[150px] rounded-xl border border-white/15 bg-black/75 text-white shadow-xl overflow-hidden">
            <a
              href={src}
              download={fileName}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => setMenuOpen(false)}
            >
              <Download size={15} />
              Скачать
            </a>
          </div>
        ) : null}
      </div>

      <img
        src={src}
        alt={fileName}
        className="max-w-full max-h-full object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );

  return createPortal(overlay, document.body);
}


export function AudioPlayer({
  src,
  fileName,
  isOwn,
  attachmentId,
  caption,
  variant = "chat",
}: {
  src: string;
  fileName: string;
  isOwn: boolean;
  /** Вложение на сервере — расшифровка через Chat API и Speech Analytics callback */
  attachmentId?: string;
  /** Подпись к файлу из тела сообщения (не дублируем с расшифровкой, если текст совпадает) */
  caption?: string;
  /** profile — нейтральный фон страницы: явные цвета «мои / собеседника». */
  variant?: "chat" | "profile";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const playerIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const [audioSrc, setAudioSrc] = useState<string>(src);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  useEffect(() => {
    setIsAudioReady(false);
    setLoadError(null);
    // По UX расшифровка скрыта по умолчанию при открытии чата.
    setTranscript(null);
    setTranscribeError(null);
    setIsTranscribing(false);
    if (!src) {
      setAudioSrc("");
      return;
    }
    if (src.startsWith("data:")) {
      try {
        const blob = dataUrlToBlob(src);
        const url = URL.createObjectURL(blob);
        setAudioSrc(url);
        return () => URL.revokeObjectURL(url);
      } catch {
        /* невалидный data URL */
      }
    }
    setAudioSrc(src);
  }, [src, attachmentId]);

  useEffect(() => {
    if (duration > 0) setIsAudioReady(true);
  }, [duration]);

  useEffect(() => {
    if (!audioSrc || isAudioReady) return;
    const t = window.setTimeout(() => setIsAudioReady(true), 1500);
    return () => window.clearTimeout(t);
  }, [audioSrc, isAudioReady]);

  useEffect(() => {
    const onOtherAudioPlay = (e: Event) => {
      const ce = e as CustomEvent<{ playerId?: string }>;
      const otherId = ce.detail?.playerId;
      if (!otherId || otherId === playerIdRef.current) return;
      const el = audioRef.current;
      if (!el) return;
      el.pause();
      el.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    };
    window.addEventListener("chatapp:audio-play", onOtherAudioPlay as EventListener);
    return () => window.removeEventListener("chatapp:audio-play", onOtherAudioPlay as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctx = new (typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : AudioContext)(1, 1, 44100);
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buffer) => ctx.decodeAudioData(buffer))
      .then((decoded) => {
        if (cancelled || !decoded) return;
        const d = decoded.duration;
        if (Number.isFinite(d) && d > 0) {
          setDuration(d);
          setIsAudioReady(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if ("close" in ctx && typeof ctx.close === "function") {
          (ctx as { close(): Promise<void> }).close().catch(() => {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const updateDurationFromEl = useCallback(() => {
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      setCurrentTime(el.currentTime);
      updateDurationFromEl();
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onCanPlayThrough = () => setIsAudioReady(true);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", updateDurationFromEl);
    el.addEventListener("loadeddata", updateDurationFromEl);
    el.addEventListener("durationchange", updateDurationFromEl);
    el.addEventListener("canplaythrough", onCanPlayThrough);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    updateDurationFromEl();
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", updateDurationFromEl);
      el.removeEventListener("loadeddata", updateDurationFromEl);
      el.removeEventListener("durationchange", updateDurationFromEl);
      el.removeEventListener("canplaythrough", onCanPlayThrough);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [src, updateDurationFromEl]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      const el = audioRef.current;
      if (el) {
        setCurrentTime(el.currentTime);
        updateDurationFromEl();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, updateDurationFromEl]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      setLoadError(null);
      window.dispatchEvent(
        new CustomEvent("chatapp:audio-play", { detail: { playerId: playerIdRef.current } }),
      );
      const p = el.play();
      if (p && typeof (p as Promise<void>).then === "function") {
        (p as Promise<void>)
          .then(() => {
            setIsPlaying(true);
          })
          .catch(() => {
            setIsPlaying(false);
            setLoadError("Воспроизведение не поддерживается или ошибка");
          });
      }
    }
  };

  const handleTranscribe = async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      if (attachmentId) {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          throw new Error("auth");
        }
        let r = await getAttachmentTranscription(tokens.access_token, attachmentId);
        if (r.status === "done" && r.text?.trim()) {
          setTranscript(r.text.trim());
          return;
        }
        if (r.status === "pending") {
          const text = await waitForAttachmentTranscription(tokens.access_token, attachmentId);
          setTranscript(text);
          return;
        }
        const audioRes = await fetch(src);
        if (!audioRes.ok) {
          throw new Error("blob");
        }
        const blob = await audioRes.blob();
        r = await startAttachmentTranscription(tokens.access_token, attachmentId, blob, fileName);
        if (r.status === "done" && r.text?.trim()) {
          setTranscript(r.text.trim());
          return;
        }
        if (r.status === "pending") {
          const text = await waitForAttachmentTranscription(tokens.access_token, attachmentId);
          setTranscript(text);
          return;
        }
        if (r.status === "failed") {
          throw new Error(r.error || "failed");
        }
        throw new Error("unexpected");
      }

      const endpoint = process.env.NEXT_PUBLIC_TRANSCRIBE_URL || "/api/transcribe";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src, fileName }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as { text?: string };
      const text = (data?.text ?? "").trim();
      if (!text) {
        throw new Error("empty");
      }
      setTranscript(text);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const boring = new Set(["auth", "blob", "empty", "unexpected", "failed"]);
      const msg =
        raw && !boring.has(raw) && !raw.startsWith("HTTP ")
          ? raw.length > 600
            ? `${raw.slice(0, 600)}…`
            : raw
          : "Не удалось расшифровать";
      setTranscribeError(msg);
    } finally {
      setIsTranscribing(false);
    }
  };

  const seekFromClientX = (clientX: number) => {
    const el = audioRef.current;
    const bar = barRef.current;
    if (!el || !bar || !duration || !Number.isFinite(duration)) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = ratio * duration;
    el.currentTime = time;
    setCurrentTime(time);
  };

  const handleBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekFromClientX(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (e: PointerEvent) => seekFromClientX(e.clientX);
    const onPointerUp = () => setIsDragging(false);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging, duration]);

  const profile = variant === "profile";
  const shellCls = profile
    ? isOwn
      ? "bg-primary/16 ring-1 ring-primary/45 dark:bg-primary/22 dark:ring-primary/50"
      : "bg-muted/80 ring-1 ring-border/90 dark:bg-muted/50 dark:ring-border/70"
    : isOwn
      ? "bg-primary-foreground/12 ring-white/15"
      : "bg-background/50 ring-black/[0.05] dark:ring-white/10";
  const playReadyCls = profile
    ? isOwn
      ? "bg-primary text-primary-foreground"
      : "bg-foreground/14 text-foreground dark:bg-foreground/18"
    : isOwn
      ? "bg-primary-foreground/90 text-primary"
      : "bg-foreground/12 text-foreground";
  const playWaitCls = profile
    ? isOwn
      ? "bg-primary/45 text-primary-foreground"
      : "bg-foreground/10 text-foreground"
    : isOwn
      ? "bg-primary-foreground/50 text-primary"
      : "bg-foreground/10 text-foreground";
  const barTrackCls = profile
    ? isOwn
      ? "bg-primary/30 dark:bg-primary/35"
      : "bg-foreground/12 dark:bg-foreground/15"
    : isOwn
      ? "bg-primary-foreground/25"
      : "bg-foreground/15";
  const barFillCls = profile
    ? isOwn
      ? "bg-primary dark:bg-primary"
      : "bg-foreground/65 dark:bg-foreground/55"
    : isOwn
      ? "bg-primary-foreground"
      : "bg-foreground/75";
  const timeCls = profile
    ? isOwn
      ? "text-primary dark:text-primary"
      : "text-muted-foreground"
    : isOwn
      ? "text-primary-foreground/85"
      : "text-foreground/65";
  const captionsCls = profile
    ? isOwn
      ? "text-primary"
      : "text-foreground/70"
    : isOwn
      ? "text-primary-foreground"
      : "text-foreground/75";
  const msgCls = profile
    ? isOwn
      ? "text-primary/95 dark:text-primary"
      : "text-foreground/80"
    : isOwn
      ? "text-primary-foreground/85"
      : "text-foreground/70";
  const captionTextCls = profile
    ? isOwn
      ? "text-foreground/90 dark:text-foreground/95"
      : "text-foreground/85"
    : isOwn
      ? "text-primary-foreground/90"
      : "text-foreground/85";

  return (
    <div
      className={`flex min-w-0 w-full max-w-full flex-col gap-1 overflow-hidden rounded-xl px-2 py-1.5 ring-inset sm:px-2.5 sm:py-2 ${shellCls}`}
    >
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="auto"
        onError={() => setLoadError("Не удалось загрузить аудио")}
      />

      <div className="flex items-center gap-1.5">
        {isAudioReady ? (
          <button
            type="button"
            onClick={togglePlay}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${playReadyCls}`}
            aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
        ) : (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${playWaitCls}`} aria-hidden>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-px">
          <div
            ref={barRef}
            role="slider"
            aria-label="Перемотка"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
            onPointerDown={handleBarPointerDown}
            onKeyDown={(e) => {
              const el = audioRef.current;
              if (!el || !duration) return;
              const step = e.shiftKey ? 10 : 5;
              if (e.key === "ArrowLeft" || e.key === "Home") {
                e.preventDefault();
                const t = e.key === "Home" ? 0 : Math.max(0, currentTime - step);
                el.currentTime = t;
                setCurrentTime(t);
              } else if (e.key === "ArrowRight" || e.key === "End") {
                e.preventDefault();
                const t = e.key === "End" ? duration : Math.min(duration, currentTime + step);
                el.currentTime = t;
                setCurrentTime(t);
              }
            }}
            className={`relative h-1 w-full cursor-pointer select-none touch-none overflow-hidden rounded-full ${barTrackCls}`}
          >
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ${barFillCls}`}
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
          <div className={`flex justify-end text-[10px] tabular-nums leading-none ${timeCls}`}>
            <span>
              {isPlaying || currentTime > 0 ? formatAudioTime(currentTime) : formatAudioTime(duration)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTranscribe}
          disabled={!isAudioReady || isTranscribing}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-60 ${captionsCls}`}
          aria-label="Расшифровать в текст"
          title="Расшифровать в текст"
        >
          {isTranscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Captions size={16} strokeWidth={2} />}
        </button>
      </div>

      {loadError ? (
        <div className={`text-[10px] leading-snug ${msgCls}`}>
          {loadError}
        </div>
      ) : null}
      {transcribeError ? (
        <div className={`text-[10px] leading-snug ${msgCls}`}>
          {transcribeError}
        </div>
      ) : null}
      {(() => {
        const cap = caption?.trim() || "";
        const tr = transcript?.trim() || "";
        if (!cap && !tr) return null;
        const same = cap.length > 0 && cap === tr;
        const textCls = captionTextCls;
        if (same) {
          return (
            <div className={`text-[11px] leading-snug whitespace-pre-wrap break-words ${textCls}`}>{tr}</div>
          );
        }
        return (
          <div className="space-y-1">
            {cap ? (
              <p className={`text-sm leading-snug whitespace-pre-wrap break-words ${textCls}`}>{cap}</p>
            ) : null}
            {tr ? (
              <div className={`text-[11px] leading-snug whitespace-pre-wrap break-words ${textCls}`}>{tr}</div>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}

function LazyImage({ dataUrl, alt, fileName }: { dataUrl: string; alt: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullShown, setFullShown] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createImagePreview(dataUrl)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(dataUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        className="block relative text-left"
        aria-label="Открыть изображение"
      >
      {previewUrl && !fullShown && (
        <img src={previewUrl} alt={alt} className="max-w-full max-h-64 rounded-xl object-contain" />
      )}
      <img
        src={dataUrl}
        alt={alt}
        className="max-w-full max-h-64 rounded-xl object-contain"
        style={fullShown ? undefined : { position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
        onLoad={() => setFullShown(true)}
      />
      </button>
      <FullscreenImageViewer open={viewerOpen} src={dataUrl} fileName={fileName} onClose={() => setViewerOpen(false)} />
    </>
  );
}

async function ciphertextBlobToObjectUrl(
  blob: Blob,
  mimeType: string,
  key_b64: string | undefined,
  nonce_b64: string | undefined,
): Promise<string> {
  const ab = await blob.arrayBuffer();
  if (key_b64 && nonce_b64) {
    const plain = await decryptAttachmentBytes(ab, key_b64, nonce_b64);
    return URL.createObjectURL(new Blob([plain], { type: mimeType }));
  }
  return URL.createObjectURL(blob);
}

function videoMessageColumnClass(isOwn: boolean): string {
  return `flex flex-col space-y-0.5 ${isOwn ? "items-end" : "items-start"}`;
}

export function chatVideoCircleWrapperClassName(isOwn: boolean, layout: "chat" | "grid" = "chat"): string {
  const ring = isOwn
    ? "border-[3px] border-primary shadow-md shadow-primary/20"
    : "border-[3px] border-foreground/22 dark:border-white/28";
  const size =
    layout === "grid"
      ? "aspect-square w-full max-w-[min(100%,7.75rem)] mx-auto"
      : "h-[min(13rem,70vw)] w-[min(13rem,70vw)]";
  return `relative ${size} shrink-0 overflow-hidden rounded-full ${ring}`;
}

/** Те же размеры и ободок, что у готового кружка — без скачков лейаута при открытии чата. */
export function ChatCircleVideoPlaceholder({
  isOwn,
  layout = "chat",
}: {
  isOwn: boolean;
  /** grid — три кружка в ряд (профиль и т.п.). */
  layout?: "chat" | "grid";
}) {
  return (
    <div className={chatVideoCircleWrapperClassName(isOwn, layout)} role="status" aria-label="Загрузка видео…">
      <div
        className={`absolute inset-[3px] rounded-full motion-safe:animate-pulse ${
          isOwn ? "bg-primary/20 dark:bg-primary/28" : "bg-muted/70 dark:bg-white/12"
        }`}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Loader2
          className={`h-8 w-8 shrink-0 animate-spin ${isOwn ? "text-primary/85" : "text-muted-foreground"}`}
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function ChatCircleVideo({
  src,
  isOwn,
  fileName,
  uploadProgress,
  layout = "chat",
}: {
  src: string;
  isOwn: boolean;
  fileName: string;
  uploadProgress?: number | null;
  layout?: "chat" | "grid";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [progressTick, setProgressTick] = useState({ current: 0, duration: 0 });
  const uploading = uploadProgress != null && Number.isFinite(uploadProgress);
  const pct = uploading ? Math.max(0, Math.min(100, Math.round(uploadProgress))) : 0;
  const showConicFill = uploading && pct < 100;
  const showTimeBadge =
    playing &&
    Number.isFinite(progressTick.duration) &&
    progressTick.duration > 0;

  useEffect(() => {
    setMediaReady(false);
    setProgressTick({ current: 0, duration: 0 });
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setPlaying(!v.paused);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const syncProgress = () => {
      const d = v.duration;
      setProgressTick({
        current: v.currentTime,
        duration: Number.isFinite(d) && d > 0 ? d : 0,
      });
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("timeupdate", syncProgress);
    v.addEventListener("loadedmetadata", syncProgress);
    v.addEventListener("durationchange", syncProgress);
    sync();
    syncProgress();
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("timeupdate", syncProgress);
      v.removeEventListener("loadedmetadata", syncProgress);
      v.removeEventListener("durationchange", syncProgress);
    };
  }, [src]);

  useEffect(() => {
    if (!uploading) return;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
  }, [uploading]);

  return (
    <div className={chatVideoCircleWrapperClassName(isOwn, layout)}>
      <video
        key={src}
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        className={`h-full w-full object-cover transition-opacity duration-200 ${
          uploading ? "pointer-events-none" : "cursor-pointer"
        } ${!uploading && !mediaReady ? "opacity-0" : "opacity-100"}`}
        aria-label={fileName}
        onLoadedData={() => setMediaReady(true)}
        onError={() => setMediaReady(true)}
        onClick={
          uploading
            ? undefined
            : () => {
                const v = videoRef.current;
                if (v && !v.paused) v.pause();
              }
        }
      />
      {!uploading && !mediaReady ? (
        <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center">
          <div
            className={`absolute inset-[3px] rounded-full motion-safe:animate-pulse ${
              isOwn ? "bg-primary/20 dark:bg-primary/28" : "bg-muted/70 dark:bg-white/12"
            }`}
          />
          <Loader2
            className={`relative z-[1] h-8 w-8 shrink-0 animate-spin ${isOwn ? "text-primary/85" : "text-muted-foreground"}`}
            strokeWidth={2}
            aria-hidden
          />
        </div>
      ) : null}
      {showConicFill ? (
        <div
          className="pointer-events-none absolute inset-0 z-[5] rounded-full"
          style={{
            background: `conic-gradient(from -90deg at 50% 50%, hsl(var(--primary) / 0.38) 0deg, hsl(var(--primary) / 0.38) ${pct * 3.6}deg, transparent ${pct * 3.6}deg)`,
          }}
          aria-hidden
        />
      ) : null}
      {uploading ? (
        <div
          className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-1.5"
          role="status"
          aria-label={`Загрузка ${pct}%`}
        >
          <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow-md" strokeWidth={2} aria-hidden />
          <span className="text-sm font-bold tabular-nums text-white drop-shadow-md [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]">
            {pct}%
          </span>
        </div>
      ) : !playing && mediaReady ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-background/92 text-primary shadow-lg ring-1 ring-black/10 transition hover:scale-[1.04] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void videoRef.current?.play();
            }}
            aria-label={`Воспроизвести: ${fileName}`}
          >
            <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" aria-hidden />
          </button>
        </div>
      ) : null}
      {showTimeBadge ? (
        <div
          className="pointer-events-none absolute left-1/2 top-2 z-[7] -translate-x-1/2 rounded-full bg-black/58 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow-sm backdrop-blur-[2px] [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]"
          aria-live="polite"
        >
          {formatAudioTime(progressTick.current)} / {formatAudioTime(progressTick.duration)}
        </div>
      ) : null}
    </div>
  );
}

function videoCaptionClass(isVideoBubble: boolean): string {
  const base = "text-sm leading-snug whitespace-pre-wrap break-words";
  return isVideoBubble ? `${base} text-foreground/90` : base;
}

function videoAwareSecondaryClass(isOwn: boolean, isVideo: boolean): string {
  if (isVideo && isOwn) return "text-foreground/65";
  return isOwn ? "text-primary-foreground/75" : "text-muted-foreground";
}

function videoAwareSecondaryClass70(isOwn: boolean, isVideo: boolean): string {
  if (isVideo && isOwn) return "text-foreground/70";
  return isOwn ? "text-primary-foreground/70" : "text-muted-foreground";
}

function RemoteFileAttachment({
  file,
  text,
  isOwn,
  messageTimestamp,
  videoUploadProgress,
  immediateMediaLoad = false,
}: {
  file: ChatMessageFile;
  text?: string;
  isOwn: boolean;
  messageTimestamp?: string;
  videoUploadProgress?: number | null;
  /** true — не ждать IntersectionObserver (клон пузырька в оверлее меню). */
  immediateMediaLoad?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inViewport = useNearViewport(containerRef, 700);
  const shouldLoadMedia = immediateMediaLoad || inViewport;
  const inlineDataUrl = file.data ? `data:${file.mimeType};base64,${file.data}` : null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const ref = file.file_ref;
  const emittedPreviewReadyRef = useRef(false);
  const emittedFullReadyRef = useRef(false);

  useEffect(() => {
    if (!shouldLoadMedia) return;
    if (!ref) return;
    if (!ref.full_key_b64 || !ref.full_nonce_b64) {
      setPreviewErr("Нет ключей расшифровки вложения");
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    let previewLease: { key: string; url: string } | null = null;
    const releasePreviewLease = () => {
      if (previewLease) {
        releaseBlobUrl(previewLease.key, previewLease.url);
        previewLease = null;
      }
    };

    setLoadingPreview(!inlineDataUrl);
    setPreviewErr(null);
    setPreviewUrl((prev) => prev || inlineDataUrl);
    setFullUrl(null);

    const previewId = ref.thumb_attachment_id || ref.attachment_id;
    const useThumbKeys = Boolean(ref.thumb_attachment_id) && previewId === ref.thumb_attachment_id;
    if (useThumbKeys && (!ref.thumb_key_b64 || !ref.thumb_nonce_b64)) {
      setPreviewErr("Нет ключей для превью");
      setLoadingPreview(false);
      return;
    }
    const keyB64 = useThumbKeys ? ref.thumb_key_b64! : ref.full_key_b64;
    const nonceB64 = useThumbKeys ? ref.thumb_nonce_b64! : ref.full_nonce_b64;
    const mediaPriority = Number.isFinite(Date.parse(messageTimestamp || "")) ? Date.parse(messageTimestamp || "") : 0;
    const previewKey = previewAttachmentCacheKey(previewId, useThumbKeys ? "thumb" : "full");

    const cachedPreview = takeCachedBlobUrl(previewKey);
    if (cachedPreview) {
      previewLease = { key: previewKey, url: cachedPreview };
      setPreviewUrl(cachedPreview);
      setLoadingPreview(false);
      if (!emittedPreviewReadyRef.current) {
        emittedPreviewReadyRef.current = true;
        window.dispatchEvent(new CustomEvent("chatapp:media-ready", { detail: { phase: "preview" } }));
      }
      return () => {
        cancelled = true;
        releasePreviewLease();
      };
    }

    void (async () => {
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token || cancelled) return;
        const url = await runWithMediaLoadLimit(async () => {
          const blob = await fetchAttachmentBlob(tokens.access_token, previewId);
          return ciphertextBlobToObjectUrl(blob, file.mimeType, keyB64, nonceB64);
        }, mediaPriority);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const registered = registerBlobUrl(previewKey, url);
        if (cancelled) {
          releaseBlobUrl(previewKey, registered);
          return;
        }
        previewLease = { key: previewKey, url: registered };
        setPreviewUrl(registered);
        setLoadingPreview(false);
        if (!emittedPreviewReadyRef.current) {
          emittedPreviewReadyRef.current = true;
          window.dispatchEvent(new CustomEvent("chatapp:media-ready", { detail: { phase: "preview" } }));
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewErr(e instanceof Error ? e.message : "Ошибка загрузки");
          setLoadingPreview(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      releasePreviewLease();
    };
  }, [
    shouldLoadMedia,
    inlineDataUrl,
    ref?.attachment_id,
    ref?.thumb_attachment_id,
    ref?.full_key_b64,
    ref?.full_nonce_b64,
    ref?.thumb_key_b64,
    ref?.thumb_nonce_b64,
    messageTimestamp,
    file.mimeType,
  ]);

  useEffect(() => {
    if (!shouldLoadMedia) return;
    if (!ref || !previewUrl || fullUrl || !file.mimeType.startsWith("image/")) return;
    if (!ref.thumb_attachment_id) return;
    if (!ref.full_key_b64 || !ref.full_nonce_b64) return;
    let cancelled = false;
    let fullLease: { key: string; url: string } | null = null;
    const releaseFullLease = () => {
      if (fullLease) {
        releaseBlobUrl(fullLease.key, fullLease.url);
        fullLease = null;
      }
    };

    const fullKey = fullImageAttachmentCacheKey(ref.attachment_id);
    const cachedFull = takeCachedBlobUrl(fullKey);
    if (cachedFull) {
      fullLease = { key: fullKey, url: cachedFull };
      setFullUrl(cachedFull);
      if (!emittedFullReadyRef.current) {
        emittedFullReadyRef.current = true;
        window.dispatchEvent(new CustomEvent("chatapp:media-ready", { detail: { phase: "full" } }));
      }
      return () => {
        cancelled = true;
        releaseFullLease();
      };
    }

    const mediaPriority = Number.isFinite(Date.parse(messageTimestamp || "")) ? Date.parse(messageTimestamp || "") : 0;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const tokens = await getValidAuthTokens();
          if (!tokens?.access_token || cancelled) return;
          const url = await runWithMediaLoadLimit(async () => {
            const blob = await fetchAttachmentBlob(tokens.access_token, ref.attachment_id);
            return ciphertextBlobToObjectUrl(blob, file.mimeType, ref.full_key_b64, ref.full_nonce_b64);
          }, mediaPriority);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          const registered = registerBlobUrl(fullKey, url);
          if (cancelled) {
            releaseBlobUrl(fullKey, registered);
            return;
          }
          fullLease = { key: fullKey, url: registered };
          setFullUrl(registered);
          if (!emittedFullReadyRef.current) {
            emittedFullReadyRef.current = true;
            window.dispatchEvent(new CustomEvent("chatapp:media-ready", { detail: { phase: "full" } }));
          }
        } catch {
          //
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      releaseFullLease();
    };
  }, [shouldLoadMedia, ref, previewUrl, fullUrl, file.mimeType, messageTimestamp]);

  const isImage = file.mimeType.startsWith("image/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isVideo = file.mimeType.startsWith("video/");

  if (!shouldLoadMedia) {
    if (inlineDataUrl) {
      if (isImage) {
        return (
          <div ref={containerRef} className="space-y-0.5">
            {text && <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>}
            <LazyImage dataUrl={inlineDataUrl} alt={file.name} fileName={file.name} />
          </div>
        );
      }
      if (isAudio) {
        return (
          <div ref={containerRef} className="space-y-0.5">
            <AudioPlayer src={inlineDataUrl} fileName={file.name} isOwn={isOwn} caption={text} />
          </div>
        );
      }
      if (isVideo) {
        return (
          <div ref={containerRef} className={videoMessageColumnClass(isOwn)}>
            {text ? <p className={videoCaptionClass(true)}>{text}</p> : null}
            <ChatCircleVideo
              src={inlineDataUrl}
              isOwn={isOwn}
              fileName={file.name}
              uploadProgress={videoUploadProgress}
            />
          </div>
        );
      }
      return (
        <div ref={containerRef} className="space-y-0.5">
          {text && <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>}
          <a
            href={inlineDataUrl}
            download={file.name}
            className={`text-sm leading-snug underline ${isOwn ? "text-primary-foreground/90" : "text-primary"}`}
          >
            {file.name}
          </a>
        </div>
      );
    }
    return (
      <div ref={containerRef} className={isVideo ? videoMessageColumnClass(isOwn) : "space-y-0.5"}>
        {text && <p className={videoCaptionClass(isVideo)}>{text}</p>}
        {isVideo ? (
          <ChatCircleVideoPlaceholder isOwn={isOwn} />
        ) : (
          <div className={`text-xs py-0.5 ${videoAwareSecondaryClass70(isOwn, isVideo)}`}>
            Подгружается при прокрутке…
          </div>
        )}
      </div>
    );
  }

  if (loadingPreview) {
    return (
      <div ref={containerRef} className={isVideo ? videoMessageColumnClass(isOwn) : "space-y-0.5"}>
        {text && <p className={videoCaptionClass(isVideo)}>{text}</p>}
        {isVideo ? (
          <ChatCircleVideoPlaceholder isOwn={isOwn} />
        ) : (
          <div
            className={`flex items-center gap-1.5 text-xs py-0.5 ${videoAwareSecondaryClass(isOwn, isVideo)}`}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Загрузка медиа…</span>
          </div>
        )}
      </div>
    );
  }

  if (previewErr) {
    return (
      <div ref={containerRef} className={isVideo ? videoMessageColumnClass(isOwn) : "space-y-0.5"}>
        {text && <p className={videoCaptionClass(isVideo)}>{text}</p>}
        <p className="text-xs text-destructive leading-snug">{previewErr}</p>
      </div>
    );
  }

  if (isImage && previewUrl) {
    const href = fullUrl || previewUrl;
    return (
      <div ref={containerRef} className="space-y-0.5">
        {text && <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>}
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="block relative text-left"
          aria-label="Открыть изображение"
        >
          <img
            src={fullUrl || previewUrl}
            alt={file.name}
            className="max-w-full max-h-64 rounded-xl object-contain transition-opacity duration-200"
          />
          {!fullUrl && ref?.thumb_attachment_id ? (
            <span
              className={`text-[10px] mt-1 block ${isOwn ? "text-primary-foreground/65" : "text-muted-foreground"}`}
            >
              Загрузка в лучшем качестве…
            </span>
          ) : null}
        </button>
        <FullscreenImageViewer open={viewerOpen} src={href} fileName={file.name} onClose={() => setViewerOpen(false)} />
      </div>
    );
  }

  if (isAudio && previewUrl) {
    return (
      <div ref={containerRef} className="space-y-0.5">
        <AudioPlayer
          src={previewUrl}
          fileName={file.name}
          isOwn={isOwn}
          attachmentId={ref?.attachment_id}
          caption={text}
        />
      </div>
    );
  }

  if (isVideo && previewUrl) {
    return (
      <div ref={containerRef} className={videoMessageColumnClass(isOwn)}>
        {text ? <p className={videoCaptionClass(true)}>{text}</p> : null}
        <ChatCircleVideo
          src={previewUrl}
          isOwn={isOwn}
          fileName={file.name}
          uploadProgress={videoUploadProgress}
        />
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div ref={containerRef} className="space-y-0.5">
        {text && <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>}
        <a
          href={previewUrl}
          download={file.name}
          className={`text-sm leading-snug underline ${isOwn ? "text-primary-foreground/90" : "text-primary"}`}
        >
          {file.name}
        </a>
      </div>
    );
  }

  return <div ref={containerRef} />;
}

export function MessageBody({
  content,
  isOwn,
  messageTimestamp,
  videoUploadProgress,
  immediateMediaLoad = false,
}: {
  content: ChatMessageContent;
  isOwn: boolean;
  messageTimestamp?: string;
  videoUploadProgress?: number | null;
  immediateMediaLoad?: boolean;
}) {
  const replyTo = "reply_to" in content ? content.reply_to : undefined;
  const main =
    content.type === "text" ? (
      <p className="text-sm leading-snug whitespace-pre-wrap break-words">{content.text || ""}</p>
    ) : (
      (() => {
        const { file, text } = content;
        if (file.file_ref) {
          return (
            <RemoteFileAttachment
              file={file}
              text={text}
              isOwn={isOwn}
              messageTimestamp={messageTimestamp}
              videoUploadProgress={videoUploadProgress}
              immediateMediaLoad={immediateMediaLoad}
            />
          );
        }
        const mediaLoading = !file.data || file.data.length === 0;
        if (mediaLoading) {
          const loadingVideo = file.mimeType.startsWith("video/");
          return (
            <div className={loadingVideo ? videoMessageColumnClass(isOwn) : "space-y-0.5"}>
              {text && <p className={videoCaptionClass(loadingVideo)}>{text}</p>}
              {loadingVideo ? (
                <ChatCircleVideoPlaceholder isOwn={isOwn} />
              ) : (
                <div
                  className={`flex items-center gap-1.5 text-xs py-1 ${videoAwareSecondaryClass(isOwn, loadingVideo)}`}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Загрузка медиа…</span>
                </div>
              )}
            </div>
          );
        }
        const dataUrl = `data:${file.mimeType};base64,${file.data}`;
        const isImage = file.mimeType.startsWith("image/");
        const isAudio = file.mimeType.startsWith("audio/");
        const isVideo = file.mimeType.startsWith("video/");
        if (isVideo) {
          return (
            <div className={videoMessageColumnClass(isOwn)}>
              {text ? <p className={videoCaptionClass(true)}>{text}</p> : null}
              <ChatCircleVideo
                src={dataUrl}
                isOwn={isOwn}
                fileName={file.name}
                uploadProgress={videoUploadProgress}
              />
            </div>
          );
        }
        return (
          <div className="space-y-0.5">
            {!isAudio && text ? (
              <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>
            ) : null}
            {isImage ? <LazyImage dataUrl={dataUrl} alt={file.name} fileName={file.name} /> : null}
            {isAudio ? <AudioPlayer src={dataUrl} fileName={file.name} isOwn={isOwn} caption={text} /> : null}
            {!isImage && !isAudio && (
              <a
                href={dataUrl}
                download={file.name}
                className={`text-sm leading-snug underline ${isOwn ? "text-primary-foreground/90" : "text-primary"}`}
              >
                {file.name}
              </a>
            )}
          </div>
        );
      })()
    );
  return (
    <div className="space-y-1 min-w-0 overflow-hidden">
      {replyTo && (
        <div
          className={`text-[11px] rounded-lg px-2 py-1 truncate leading-tight ${
            isOwn
              ? "bg-primary-foreground/14 text-primary-foreground/90"
              : "bg-background/60 text-foreground/80 ring-1 ring-inset ring-black/[0.04] dark:bg-black/15 dark:ring-white/10"
          }`}
        >
          <span className="font-medium opacity-80">Ответ · </span>
          {replyTo.preview}
        </div>
      )}
      {main}
    </div>
  );
}
