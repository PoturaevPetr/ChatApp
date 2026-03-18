"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Send,
  Loader2,
  Paperclip,
  Reply,
  XCircle,
  Mic,
  Square,
  Play,
  Pause,
  Download,
  FileText,
  ArrowDown,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { EmojiPicker } from "@/components/EmojiPicker";
import { AttachFileModal } from "@/components/AttachFileModal";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore, type ChatMessageFile, type ChatMessageContent, type ReplyTo } from "@/stores/chatStore";
import { getDemoUsers } from "@/lib/storage";
import { formatMessageTime, groupMessagesByDate, getMessagePreviewText, createImagePreview } from "@/utils/chatUtils";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hashStringToIndex(input: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h);
  return modulo > 0 ? n % modulo : 0;
}

const OTHER_BUBBLE_GLASS_VARIANTS = [
  "bg-zinc-500/10 border-zinc-300/20",
  "bg-slate-500/10 border-slate-300/20",
  "bg-neutral-500/10 border-neutral-300/20",
  "bg-stone-500/10 border-stone-300/20",
  "bg-gray-500/10 border-gray-300/20",
] as const;

function otherBubbleVariant(senderId: string): string {
  const idx = hashStringToIndex(senderId || "unknown", OTHER_BUBBLE_GLASS_VARIANTS.length);
  return OTHER_BUBBLE_GLASS_VARIANTS[idx] ?? OTHER_BUBBLE_GLASS_VARIANTS[0];
}

function AudioPlayer({ src, fileName, isOwn }: { src: string; fileName: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const playerIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    setTranscript(null);
    setTranscribeError(null);
    setIsTranscribing(false);
  }, [src]);

  useEffect(() => {
    if (duration > 0) setIsAudioReady(true);
  }, [duration]);

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
      window.dispatchEvent(
        new CustomEvent("chatapp:audio-play", { detail: { playerId: playerIdRef.current } })
      );
      const p = el.play();
      if (p && typeof (p as Promise<void>).then === "function") {
        (p as Promise<void>)
          .then(() => {
            setIsPlaying(true);
          })
          .catch(() => {
            setIsPlaying(false);
          });
      }
    }
  };

  const handleTranscribe = async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
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
    } catch {
      setTranscribeError("Не удалось расшифровать");
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

  const handleBarPointerDown = (e: React.PointerEvent) => {
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

  return (
    <div
      className={`flex flex-col gap-1 py-2 px-2 rounded-xl min-w-[260px] max-w-[340px] ${
        isOwn ? "bg-primary/25" : "bg-muted/80"
      }`}
    >
      <audio ref={audioRef} src={src} preload="auto" />

      <div className="flex items-center gap-2">
        {isAudioReady ? (
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/40 text-primary-foreground"
            aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/30 text-primary-foreground"
            aria-hidden
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
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
            className="relative h-1.5 w-full rounded-full overflow-hidden bg-white/30 cursor-pointer select-none touch-none"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-75"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
          <div className="flex justify-end text-[11px] text-white tabular-nums">
            <span>
              {isPlaying || currentTime > 0 ? formatAudioTime(currentTime) : formatAudioTime(duration)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTranscribe}
          disabled={!isAudioReady || isTranscribing}
          className="flex h-8 w-4 shrink-0 items-center justify-center rounded-full text-primary-foreground disabled:opacity-60"
          aria-label="Расшифровать"
          title="Расшифровать"
        >
          {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText size={16} />}
        </button>

        <a
          href={src}
          download={fileName}
          className="flex h-8 w-4 shrink-0 items-center justify-center rounded-full text-primary-foreground "
          aria-label="Скачать"
          title="Скачать"
        >
          <Download size={16} />
        </a>
      </div>

      {transcribeError ? <div className="text-[11px] text-white/80">{transcribeError}</div> : null}
      {transcript ? <div className="text-xs text-white/90 whitespace-pre-wrap break-words">{transcript}</div> : null}
    </div>
  );
}

function LazyImage({ dataUrl, alt, fileName }: { dataUrl: string; alt: string; fileName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullShown, setFullShown] = useState(false);

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
    <a href={dataUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="block relative">
      {previewUrl && !fullShown && (
        <img
          src={previewUrl}
          alt={alt}
          className="max-w-full max-h-64 rounded-lg object-contain"
        />
      )}
      <img
        src={dataUrl}
        alt={alt}
        className="max-w-full max-h-64 rounded-lg object-contain"
        style={fullShown ? undefined : { position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
        onLoad={() => setFullShown(true)}
      />
    </a>
  );
}

function MessageBody({ content, isOwn }: { content: ChatMessageContent; isOwn: boolean }) {
  const replyTo = "reply_to" in content ? content.reply_to : undefined;
  const main = content.type === "text" ? (
    <p className="text-sm whitespace-pre-wrap break-words">{content.text || ""}</p>
  ) : (
    (() => {
      const { file, text } = content;
      const mediaLoading = !file.data || file.data.length === 0;
      if (mediaLoading) {
        return (
          <div className="space-y-1">
            {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Загрузка медиа…</span>
            </div>
          </div>
        );
      }
      const dataUrl = `data:${file.mimeType};base64,${file.data}`;
      const isImage = file.mimeType.startsWith("image/");
      const isAudio = file.mimeType.startsWith("audio/");
      return (
        <div className="space-y-1">
          {text && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
          {isImage ? (
            <LazyImage dataUrl={dataUrl} alt={file.name} fileName={file.name} />
          ) : null}
          {isAudio ? (
            <AudioPlayer src={dataUrl} fileName={file.name} isOwn={isOwn} />
          ) : null}
          {!isImage && !isAudio && (
            <a
              href={dataUrl}
              download={file.name}
              className={`text-sm underline ${isOwn ? "text-primary-foreground/90" : "text-primary"}`}
            >
              {file.name}
            </a>
          )}
        </div>
      );
    })()
  );
  return (
    <div className="space-y-1">
      {replyTo && (
        <div
          className={`text-xs border-l-2 pl-2 py-0.5 truncate ${
            isOwn ? "border-primary-foreground/50 text-primary-foreground/80" : "border-primary/50 text-muted-foreground"
          }`}
        >
          Ответ на: {replyTo.preview}
        </div>
      )}
      {main}
    </div>
  );
}

function ChatThreadContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId")?.trim() ?? null;
  const nameFromQuery = searchParams.get("name")?.trim() ?? null;
  const { user } = useAuthStore();
  const {
    activeChatMessages,
    activeChatUser,
    isMessagesLoading,
    error: messagesError,
    setActiveChat,
    clearActiveChat,
    sendMessage,
    loadChats,
    loadUsers,
    isSending,
  } = useChatStore();
  const [input, setInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyTo | null>(null);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const swipeStart = useRef<{ x: number; y: number; replyTo: ReplyTo } | null>(null);
  const SWIPE_THRESHOLD = 50;

  const handleSwipeStart = (clientX: number, clientY: number, replyTo: ReplyTo) => {
    swipeStart.current = { x: clientX, y: clientY, replyTo };
  };
  const handleSwipeEnd = (clientX: number, clientY: number) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      setReplyingTo(start.replyTo);
    }
  };

  useEffect(() => {
    if (!user || !userId) return;
    loadUsers();
    const all = getDemoUsers();
    const other = all.find((u) => u.id === userId);
    const displayName =
      nameFromQuery ||
      (other ? other.name : null) ||
      (userId ? `Пользователь ${String(userId).slice(0, 8)}` : "Пользователь");
    const otherUser = other
      ? { id: other.id, name: displayName, avatar: other.avatar ?? null }
      : { id: userId, name: displayName, avatar: null as string | null };
    (async () => {
      await loadChats(user.id);
      setActiveChat(user.id, otherUser);
    })();
    return () => clearActiveChat();
  }, [user?.id, userId, nameFromQuery, setActiveChat, clearActiveChat, loadUsers, loadChats]);

  useEffect(() => {
    // New chat opened -> allow initial scroll-to-bottom again.
    didInitialScrollRef.current = false;
    setShowScrollToBottom(false);
  }, [userId]);

  const updateScrollToBottomVisibility = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    setShowScrollToBottom(distanceFromBottom > 140);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    const bottom = bottomRef.current;
    if (!bottom) return;
    if (isMessagesLoading) return;

    if (!didInitialScrollRef.current) {
      // Wait until we actually have messages rendered; otherwise we "lock in" the flag too early.
      if (activeChatMessages.length === 0) return;
      didInitialScrollRef.current = true;
      bottom.scrollIntoView({ behavior: "auto" });
      updateScrollToBottomVisibility();
      return;
    }

    if (!scroller) {
      bottom.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    const isNearBottom = distanceFromBottom < 120;
    if (isNearBottom) {
      bottom.scrollIntoView({ behavior: "smooth" });
    }
    updateScrollToBottomVisibility();
  }, [activeChatMessages, isMessagesLoading]);

  useEffect(() => {
    if (!fileError) return;
    const timeout = window.setTimeout(() => setFileError(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [fileError]);

  useEffect(() => {
    return () => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!user || !userId) {
    return (
      <AuthGuard requireAuth>
        <Layout>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p>Выберите чат или начните новый.</p>
            <Link href="/" className="mt-4 text-primary hover:underline">
              К списку чатов
            </Link>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    await sendMessage(user.id, userId, text, undefined, replyingTo ?? undefined);
    setReplyingTo(null);
    setInput("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      clearFileInputs();
      setFileError(`Файл "${file.name}" не загружен: максимум ${MAX_FILE_SIZE / 1024 / 1024} МБ`);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const data = (reader.result as string).split(",")[1];
      if (!data) return;
      const filePayload: ChatMessageFile = {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data,
      };
      await sendMessage(user.id, userId, input.trim(), filePayload, replyingTo ?? undefined);
      setReplyingTo(null);
      setInput("");
      clearFileInputs();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const clearFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const name = `audio-${Date.now()}.${ext}`;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          if (base64 && user?.id && userId) {
            sendMessage(user.id, userId, "", { name, mimeType, data: base64 }, replyingTo ?? undefined);
            setReplyingTo(null);
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start(200);
      setIsRecording(true);
    } catch (err) {
      console.warn("Audio recording failed:", err);
      setFileError("Не удалось получить доступ к микрофону");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const displayName = activeChatUser?.name ?? "Пользователь";
  const groups = groupMessagesByDate(activeChatMessages);
  const hasMessages = activeChatMessages.length > 0;

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex h-full min-h-0 flex-col overflow-hidden relative">
          <header className="absolute w-full top-0 z-30 overflow-hidden border-b border-white/10 bg-background/35 backdrop-blur-xl shadow-[0_10px_30px_-20px_rgba(0,0,0,0.6)]">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/0 to-background/40" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="absolute -top-28 left-6 h-72 w-72 rounded-full bg-primary/18 blur-3xl" />
              <div className="absolute -top-24 right-10 h-64 w-64 rounded-full bg-white/12 blur-3xl" />
              <div className="absolute -bottom-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            </div>
            <div className="relative flex items-center gap-3 px-4 py-3">
              <div className="relative shrink-0">
                <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary/45 via-primary/15 to-transparent blur-md" />
                <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-sm">
                  {activeChatUser?.avatar ? (
                    <img
                      src={activeChatUser.avatar}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center font-semibold text-primary drop-shadow-sm">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-foreground truncate">{displayName}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">ID: {String(activeChatUser?.id ?? "").slice(0, 10)}</span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span className="truncate">E2E</span>
                </div>
              </div>
            </div>
          </header>

          <div className="relative flex-1 min-h-0 overflow-hidden">
            

            <div
              ref={scrollRef}
              onScroll={updateScrollToBottomVisibility}
              className="no-scrollbar relative z-10 h-full overflow-y-auto overscroll-contain px-4 pt-20 pb-20"
            >
              <div className="min-h-full flex flex-col justify-end space-y-4">
                {isMessagesLoading && (
                  <div className="flex justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
                {messagesError && !isMessagesLoading && (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <p className="text-sm text-destructive mb-2">{messagesError}</p>
                    <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                      Ключи шифрования создаются при регистрации в приложении и хранятся на устройстве. Если вы вошли через
                      существующий аккаунт на другом устройстве, сообщения не получится расшифровать.
                    </p>
                    <Link href="/profile" className="text-sm text-primary hover:underline font-medium">
                      Перейти в профиль
                    </Link>
                  </div>
                )}
                {!isMessagesLoading && !messagesError && !hasMessages && (
                  <p className="text-center text-sm text-muted-foreground py-8">Нет сообщений</p>
                )}
                {!isMessagesLoading && !messagesError && hasMessages && (
                  <>
                    {groups.length > 0 ? (
                      groups.map(({ date, messages }) => (
                        <div key={date}>
                          <p className="text-center text-xs text-muted-foreground py-2">{date}</p>
                          <div className="space-y-2">
                            {messages.map((msg) => {
                              const replyToPayload: ReplyTo = {
                                id: msg.id,
                                preview: getMessagePreviewText(msg.content, 50),
                              };
                              return (
                                <div key={String(msg.id)} className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}>
                                  <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2 group select-none backdrop-blur-md border ${
                                      msg.isOwn
                                        ? "text-primary-foreground rounded-br-md bg-primary/35 border-primary/45 shadow-xl"
                                        : `text-foreground rounded-bl-md shadow-xl ${otherBubbleVariant(msg.senderId)}`
                                    }`}
                                    onTouchStart={(e) =>
                                      handleSwipeStart(e.touches[0].clientX, e.touches[0].clientY, replyToPayload)
                                    }
                                    onTouchEnd={(e) =>
                                      handleSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
                                    }
                                    onMouseDown={(e) => handleSwipeStart(e.clientX, e.clientY, replyToPayload)}
                                    onMouseUp={(e) => handleSwipeEnd(e.clientX, e.clientY)}
                                    onMouseLeave={() => {
                                      swipeStart.current = null;
                                    }}
                                  >
                                    <MessageBody content={msg.content} isOwn={msg.isOwn} />
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                      <p
                                        className={`text-xs ${
                                          msg.isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                                        }`}
                                      >
                                        {formatMessageTime(msg.timestamp)}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => setReplyingTo(replyToPayload)}
                                        className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 focus:outline-none focus:ring-1 ${
                                          msg.isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                                        }`}
                                        aria-label="Ответить"
                                      >
                                        <Reply size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      activeChatMessages.map((msg) => {
                        const replyToPayload: ReplyTo = { id: msg.id, preview: getMessagePreviewText(msg.content, 50) };
                        return (
                          <div key={String(msg.id)} className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2 group select-none backdrop-blur-md border ${
                                msg.isOwn
                                  ? "text-primary-foreground rounded-br-md bg-primary/35 border-primary/45 shadow-xl"
                                  : `text-foreground rounded-bl-md ${otherBubbleVariant(msg.senderId)}`
                              }`}
                              onTouchStart={(e) => handleSwipeStart(e.touches[0].clientX, e.touches[0].clientY, replyToPayload)}
                              onTouchEnd={(e) => handleSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
                              onMouseDown={(e) => handleSwipeStart(e.clientX, e.clientY, replyToPayload)}
                              onMouseUp={(e) => handleSwipeEnd(e.clientX, e.clientY)}
                              onMouseLeave={() => {
                                swipeStart.current = null;
                              }}
                            >
                              <MessageBody content={msg.content} isOwn={msg.isOwn} />
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <p
                                  className={`text-xs ${
                                    msg.isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                                  }`}
                                >
                                  {formatMessageTime(msg.timestamp)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setReplyingTo(replyToPayload)}
                                  className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 focus:outline-none focus:ring-1 ${
                                    msg.isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                                  }`}
                                  aria-label="Ответить"
                                >
                                  <Reply size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}
                {!isMessagesLoading && <div ref={bottomRef} />}
              </div>
            </div>
          </div>

          {showScrollToBottom ? (
            <button
              type="button"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute border right-4 bottom-24 z-40 flex h-11 w-11 items-center text-primary justify-center rounded-full border border-primary/50 bg-background/50 backdrop-blur-xl shadow-lg hover:bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Вниз"
              title="Вниз"
            >
              <ArrowDown size={18} />
            </button>
          ) : null}

          <div className="absolute w-full bottom-0 z-30 border-t border-white/10 bg-background/60 backdrop-blur-xl">
            <div className="px-4 pb-3 pt-2">
              {fileError && (
                <div className="mb-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{fileError}</p>
                </div>
              )}
              {replyingTo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                  <p className="flex-1 truncate text-sm text-muted-foreground">Ответ на: {replyingTo.preview}</p>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="shrink-0 rounded text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="Отменить ответ"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex h-full items-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="*/*"
                    onChange={handleFileSelect}
                    aria-hidden
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    aria-hidden
                  />
                  <AttachFileModal
                    isOpen={attachModalOpen}
                    onClose={() => setAttachModalOpen(false)}
                    onTakePhoto={() => cameraInputRef.current?.click()}
                    onUploadFile={() => fileInputRef.current?.click()}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-3xl border border-border bg-background py-1 pl-1.5 pr-1.5 focus-within:ring-2 focus-within:ring-primary/30">
                    <button
                      type="button"
                      onClick={() => setAttachModalOpen(true)}
                      className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      aria-label="Прикрепить файл"
                    >
                      <Paperclip size={22} />
                    </button>
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setInput((prev) => prev + emoji);
                        inputRef.current?.focus();
                      }}
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Сообщение..."
                      className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                    />
                    {input.trim() ? (
                      <button
                        type="submit"
                        disabled={isSending}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 hover:enabled:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                        aria-label="Отправить"
                      >
                        <Send size={20} />
                      </button>
                    ) : isRecording ? (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:ring-offset-2 focus:ring-offset-background"
                        aria-label="Остановить запись"
                      >
                        <Square size={18} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                        aria-label="Записать голосовое"
                      >
                        <Mic size={20} />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
          Загрузка...
        </div>
      }
    >
      <ChatThreadContent />
    </Suspense>
  );
}
