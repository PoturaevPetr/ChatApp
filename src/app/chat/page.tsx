"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Send,
  Loader2,
  Paperclip,
  XCircle,
  Mic,
  Video,
  ArrowDown,
  MoreVertical,
  ArrowLeft,
  Trash2,
  SwitchCamera,
  Users,
  LogOut,
  Pencil,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { EmojiKeyboardPanel, EmojiKeyboardTrigger } from "@/components/EmojiPicker";
import { AttachFileModal } from "@/components/AttachFileModal";
import { useAuthStore } from "@/stores/authStore";
import {
  useChatStore,
  groupSyntheticPeerId,
  isGroupThreadPeerId,
  type ChatMessage,
  type ReplyTo,
  type ChatUser,
} from "@/stores/chatStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { chatWebSocket } from "@/services/chatWebSocket";
import { getMessagePreviewText, groupMessagesByDate } from "@/utils/chatUtils";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { deleteRoom, leaveRoom } from "@/services/chatRoomsApi";
import { deleteMessage as deleteMessageOnServer } from "@/services/chatMessagesApi";
import { setMessageReaction } from "@/services/chatReactionsApi";
import { getUserById } from "@/services/chatUsersApi";
import { formatPeerPresenceLabel } from "@/lib/formatPeerPresence";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { MessageActionsOverlay } from "@/components/chat/MessageActionsOverlay";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App, type BackButtonListenerEvent } from "@capacitor/app";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { CapacitorAudioEngine } from "capacitor-audio-engine";
import { base64ToBlob } from "@/lib/imageCompress";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  alertFileTooLarge,
  maxAttachmentSizeLabelMb,
} from "@/lib/chatUploadLimits";
import { useCaptureModeStore } from "@/stores/captureModeStore";
import { useVisualViewportKeyboardInset } from "@/hooks/useVisualViewportKeyboardInset";

/** Столбцы гистограммы громкости при записи голоса в браузере. */
const AUDIO_METER_BAR_COUNT = 28;

function emptyAudioMeterLevels(): number[] {
  return Array.from({ length: AUDIO_METER_BAR_COUNT }, () => 0.08);
}

function getAudioContextCtor(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Speech Analytics принимает только .wav, .mp3, .flac, .ogg, .m4a, .aac — не .webm.
 * Сначала пробуем M4A/AAC (Chrome 106+, Safari), иначе OGG/WebM.
 */
const BROWSER_RECORDING_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const BROWSER_VIDEO_RECORDING_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

/** Короткий тап переключает аудио/видео; удержание дольше — начало записи. */
const RECORD_HOLD_DELAY_MS = 220;
const MIN_RECORDED_MEDIA_BYTES = 800;
/** Максимальная длительность видеосообщения-кружка (запись обрывается автоматически). */
const MAX_VIDEO_CIRCLE_RECORDING_MS = 40_000;

/** Кружок: умеренное разрешение — меньше цифровой «зум»/кроп на телефонах, меньше файл. */
const VIDEO_CIRCLE_WIDTH_IDEAL = 480;
const VIDEO_CIRCLE_WIDTH_MAX = 640;
const VIDEO_CIRCLE_HEIGHT_IDEAL = 640;
const VIDEO_CIRCLE_HEIGHT_MAX = 854;
const VIDEO_CIRCLE_FPS_IDEAL = 24;
const VIDEO_CIRCLE_FPS_MAX = 28;
/** Битрейт видео (где MediaRecorder поддерживает). */
const VIDEO_CIRCLE_RECORDER_VIDEO_BPS = 900_000;

function videoCircleVideoConstraints(
  facing: "user" | "environment",
  facingStrict: boolean,
): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    width: { ideal: VIDEO_CIRCLE_WIDTH_IDEAL, max: VIDEO_CIRCLE_WIDTH_MAX },
    height: { ideal: VIDEO_CIRCLE_HEIGHT_IDEAL, max: VIDEO_CIRCLE_HEIGHT_MAX },
    frameRate: { ideal: VIDEO_CIRCLE_FPS_IDEAL, max: VIDEO_CIRCLE_FPS_MAX },
  };
  if (facingStrict) {
    return { ...base, facingMode: { exact: facing } };
  }
  return { ...base, facingMode: { ideal: facing } };
}

async function pickAlternateVideoInputDeviceId(currentId: string | undefined): Promise<string | undefined> {
  if (!navigator.mediaDevices?.enumerateDevices) return undefined;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  if (inputs.length < 2) return undefined;
  const other = inputs.find((d) => d.deviceId !== currentId);
  return other?.deviceId;
}

/**
 * Видео только для кружка: сначала strict facing (надёжное переключение), затем ideal, затем другой deviceId.
 */
async function getUserMediaVideoCircleTrackOnly(
  facing: "user" | "environment",
  currentDeviceId: string | undefined,
): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: videoCircleVideoConstraints(facing, true), audio: false },
    { video: videoCircleVideoConstraints(facing, false), audio: false },
  ];
  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  const altId = await pickAlternateVideoInputDeviceId(currentDeviceId);
  if (altId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: altId },
          width: { ideal: VIDEO_CIRCLE_WIDTH_IDEAL, max: VIDEO_CIRCLE_WIDTH_MAX },
          height: { ideal: VIDEO_CIRCLE_HEIGHT_IDEAL, max: VIDEO_CIRCLE_HEIGHT_MAX },
          frameRate: { ideal: VIDEO_CIRCLE_FPS_IDEAL, max: VIDEO_CIRCLE_FPS_MAX },
        },
        audio: false,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("getUserMedia video failed");
}

function pickBrowserRecordingMime(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  for (const c of BROWSER_RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

function fileExtensionForRecordedAudioMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "m4a";
}

function pickBrowserVideoRecordingMime(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  for (const c of BROWSER_VIDEO_RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

function fileExtensionForRecordedVideoMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  return "webm";
}

/** Длительность записи на кнопке: «0:03» или «1:05». */
function formatRecordingDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Ждём первый отрисованный кадр превью, чтобы MediaRecorder не захватывал чёрный кадр
 * сразу после getUserMedia.
 */
async function waitForVideoReadyToRecord(video: HTMLVideoElement): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("canplay", finish);
        video.removeEventListener("error", fail);
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("canplay", finish);
        video.removeEventListener("error", fail);
        reject(new Error("video"));
      };
      video.addEventListener("loadeddata", finish);
      video.addEventListener("canplay", finish);
      video.addEventListener("error", fail);
    });
  }
  await video.play();
  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise<void>((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
    });
  } else {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function fallbackPeerName(userId: string): string {
  const short = String(userId).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}


function ChatThreadContent() {
  const keyboardInset = useVisualViewportKeyboardInset();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomIdParam = searchParams.get("roomId")?.trim() ?? null;
  const userId = searchParams.get("userId")?.trim() ?? null;
  /** Для UI и sendMessage: в группе — synthetic id `g:{roomId}`. */
  const threadPeerId = roomIdParam ? groupSyntheticPeerId(roomIdParam) : userId;
  const { user } = useAuthStore();
  const {
    activeChatMessages,
    activeChatUser,
    activeRoomId,
    isMessagesLoading,
    activeChatHasMoreOlder,
    isLoadingOlderMessages,
    error: messagesError,
    setActiveChat,
    clearActiveChat,
    removeChatByRoomId,
    sendMessage,
    loadChats,
    chats,
    loadUsers,
    isSending,
    removeMessageFromActiveChat,
    applyMessageReaction,
    peerTyping,
  } = useChatStore();
  const isSocketConnected = useWebSocketStore((s) => s.isConnected);
  const ensureConnected = useWebSocketStore((s) => s.ensureConnected);
  const [input, setInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyTo | null>(null);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [emojiKeyboardOpen, setEmojiKeyboardOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  /** Видео: warmup — камера подключается, кадр ещё не готов; recording — идёт MediaRecorder. */
  const [videoRecordPhase, setVideoRecordPhase] = useState<null | "warmup" | "recording">(null);
  /** Текущая длительность активной записи (мс), обновляется таймером. */
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  /** Нормализованные уровни 0…1 для полос гистограммы микрофона. */
  const [audioMeterLevels, setAudioMeterLevels] = useState<number[]>(emptyAudioMeterLevels);
  /** Короткий тап по кнопке микрофона/камеры: режим захвата. Удержание — запись. (persist: zustand + Preferences/localStorage) */
  const captureMode = useCaptureModeStore((s) => s.captureMode);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [leaveGroupModalOpen, setLeaveGroupModalOpen] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{ message: ChatMessage; rect: DOMRect } | null>(null);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ChatMessage | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** После подгрузки старых сообщений восстанавливаем позицию скролла (сохраняем «якорь» по высоте). */
  const pendingOlderScrollRestoreRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(
    null,
  );
  const didInitialScrollRef = useRef(false);
  const mediaAutoscrollUntilRef = useRef(0);
  const userTouchedScrollRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const emojiKeyboardOpenRef = useRef(false);
  const attachModalOpenRef = useRef(false);
  const headerMenuOpenRef = useRef(false);
  const deleteModalOpenRef = useRef(false);
  const isDeletingChatRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  /** Активная камера при записи кружка: селфи / основная. */
  const videoFacingModeRef = useRef<"user" | "environment">("user");
  const [videoFacingMode, setVideoFacingMode] = useState<"user" | "environment">("user");
  const [videoCameraFlipping, setVideoCameraFlipping] = useState(false);
  const videoCameraFlipLockRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const micRequestInProgressRef = useRef(false);
  const recordingWithNativeEngineRef = useRef(false);
  const recordHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordPointerDownRef = useRef(false);
  const recordHoldDidStartRef = useRef(false);
  const abandonNativeRecordRef = useRef(false);
  /** Защита от двойного нажатия «Отправить» при остановке MediaRecorder. */
  const finalizeRecordingLockRef = useRef(false);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});
  const sendRecordingCtxRef = useRef<{
    myId: string;
    peerId: string;
    reply: ReplyTo | null;
  }>({ myId: "", peerId: "", reply: null });
  const [peerReady, setPeerReady] = useState(false);

  useLayoutEffect(() => {
    void useCaptureModeStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    sendRecordingCtxRef.current = {
      myId: user?.id ?? "",
      peerId: threadPeerId ?? "",
      reply: replyingTo,
    };
  }, [user?.id, threadPeerId, replyingTo]);

  useEffect(() => {
    const countVideo =
      captureMode === "video" && (videoRecordPhase === "warmup" || videoRecordPhase === "recording");
    const countAudio = captureMode === "audio" && isRecording;
    if (!countVideo && !countAudio) {
      setRecordingDurationMs(0);
      return;
    }
    if (captureMode === "video" && videoRecordPhase !== "recording") {
      setRecordingDurationMs(0);
      return;
    }
    const started = Date.now();
    setRecordingDurationMs(0);
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setRecordingDurationMs(elapsed);
      if (useCaptureModeStore.getState().captureMode === "video" && elapsed >= MAX_VIDEO_CIRCLE_RECORDING_MS) {
        void stopRecordingRef.current();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [isRecording, captureMode, videoRecordPhase]);

  useEffect(() => {
    if (videoRecordPhase !== null) return;
    const el = videoPreviewRef.current;
    if (el) el.srcObject = null;
    videoFacingModeRef.current = "user";
    setVideoFacingMode("user");
  }, [videoRecordPhase]);

  const flipVideoCamera = useCallback(async () => {
    if (videoCameraFlipLockRef.current) return;
    const stream = streamRef.current;
    if (!stream || !navigator.mediaDevices?.getUserMedia) return;
    const nextFacing = videoFacingModeRef.current === "user" ? "environment" : "user";
    videoCameraFlipLockRef.current = true;
    setVideoCameraFlipping(true);
    let tmp: MediaStream | null = null;
    try {
      const currentDeviceId = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId;
      tmp = await getUserMediaVideoCircleTrackOnly(nextFacing, currentDeviceId);
      const newTrack = tmp.getVideoTracks()[0];
      if (!newTrack) {
        tmp.getTracks().forEach((t) => t.stop());
        throw new Error("no video track");
      }
      if (abandonNativeRecordRef.current) {
        tmp.getTracks().forEach((t) => t.stop());
        tmp = null;
        return;
      }
      // Сначала добавляем новый трек, потом гасим старый — иначе MediaRecorder теряет видео.
      const oldVideo = [...stream.getVideoTracks()];
      stream.addTrack(newTrack);
      for (const t of oldVideo) {
        stream.removeTrack(t);
        t.stop();
      }
      tmp = null;
      videoFacingModeRef.current = nextFacing;
      setVideoFacingMode(nextFacing);
      const el = videoPreviewRef.current;
      if (el) {
        el.srcObject = stream;
        void el.play().catch(() => {});
      }
    } catch (e) {
      const isOver =
        e instanceof DOMException &&
        (e.name === "OverconstrainedError" || e.name === "NotFoundError");
      setFileError(
        isOver ? "Эта камера на устройстве недоступна." : "Не удалось переключить камеру.",
      );
      console.warn("[chat] flip camera:", e);
    } finally {
      if (tmp) tmp.getTracks().forEach((t) => t.stop());
      videoCameraFlipLockRef.current = false;
      setVideoCameraFlipping(false);
    }
  }, []);

  /** Гистограмма по громкости: Web Audio в браузере; на нативе — мягкий индикатор активности. */
  useEffect(() => {
    if (!isRecording || captureMode !== "audio") {
      setAudioMeterLevels(emptyAudioMeterLevels());
      return;
    }
    if (recordingWithNativeEngineRef.current) {
      let tick = 0;
      const id = window.setInterval(() => {
        tick += 1;
        setAudioMeterLevels(
          Array.from({ length: AUDIO_METER_BAR_COUNT }, (_, i) => {
            const wobble = 0.14 + 0.12 * Math.sin(tick / 6 + i * 0.4);
            return Math.min(0.92, Math.max(0.1, wobble));
          }),
        );
      }, 90);
      return () => window.clearInterval(id);
    }
    const stream = streamRef.current;
    if (!stream) {
      setAudioMeterLevels(emptyAudioMeterLevels());
      return;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      setAudioMeterLevels(emptyAudioMeterLevels());
      return;
    }
    let ctx: AudioContext | null = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.68;
    source.connect(analyser);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let stopped = false;

    const loop = () => {
      if (stopped || !ctx) return;
      analyser.getByteFrequencyData(freq);
      const binCount = analyser.frequencyBinCount;
      const hi = Math.max(8, Math.floor(binCount * 0.88));
      const next: number[] = [];
      for (let i = 0; i < AUDIO_METER_BAR_COUNT; i++) {
        const a = Math.floor((i / AUDIO_METER_BAR_COUNT) * hi);
        const b = Math.floor(((i + 1) / AUDIO_METER_BAR_COUNT) * hi);
        let sum = 0;
        const n = Math.max(1, b - a);
        for (let j = a; j < b; j++) sum += freq[j];
        const raw = sum / n / 255;
        const boosted = Math.min(1, raw * 2.35 + 0.07);
        next.push(boosted);
      }
      setAudioMeterLevels(next);
      raf = requestAnimationFrame(loop);
    };

    void ctx.resume().then(() => {
      if (!stopped) raf = requestAnimationFrame(loop);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        //
      }
      void ctx?.close();
      ctx = null;
    };
  }, [isRecording, captureMode]);

  useEffect(() => {
    if (!user || !threadPeerId) {
      setPeerReady(false);
      return;
    }
    loadUsers();
    let cancelled = false;
    setPeerReady(false);

    void (async () => {
      const tokens = await getValidAuthTokens();
      try {
        await loadChats(user.id);
      } catch {
        //
      }
      if (cancelled) return;

      const chatsSnap = useChatStore.getState().chats;

      if (roomIdParam) {
        const fromList = chatsSnap.find((c) => c.id === roomIdParam);
        const otherUser: ChatUser = fromList
          ? {
              id: fromList.otherUser.id,
              name: fromList.otherUser.name,
              avatar: fromList.otherUser.avatar ?? null,
              lastSeenAt: fromList.otherUser.lastSeenAt ?? null,
              isOnline: fromList.otherUser.isOnline,
            }
          : {
              id: groupSyntheticPeerId(roomIdParam),
              name: "Группа",
              avatar: null,
            };
        if (cancelled) return;
        setActiveChat(user.id, otherUser);
        setPeerReady(true);
        return;
      }

      const uidLower = (userId ?? "").toLowerCase();
      const fromList = chatsSnap.find((c) => String(c.otherUser.id).toLowerCase() === uidLower);
      const fromListUser: ChatUser | null = fromList
        ? {
            id: fromList.otherUser.id,
            name: fromList.otherUser.name,
            avatar: fromList.otherUser.avatar ?? null,
            lastSeenAt: fromList.otherUser.lastSeenAt ?? null,
            isOnline: fromList.otherUser.isOnline,
          }
        : null;

      let otherUser: ChatUser;

      if (tokens?.access_token && userId) {
        try {
          const u = await getUserById(tokens.access_token, userId);
          if (cancelled) return;
          if (u?.id) {
            const parts = [u.last_name, u.first_name, u.middle_name].filter(Boolean) as string[];
            const nameFromParts = parts.length > 0 ? parts.join(" ").trim() : "";
            const name = (u.name && u.name.trim()) || nameFromParts || fallbackPeerName(userId);
            otherUser = {
              id: u.id,
              name,
              avatar: u.avatar ?? null,
              lastSeenAt: u.lastSeenAt ?? fromListUser?.lastSeenAt ?? null,
              isOnline: fromListUser?.isOnline,
            };
          } else if (fromListUser) {
            otherUser = fromListUser;
          } else {
            otherUser = { id: userId, name: fallbackPeerName(userId), avatar: null };
          }
        } catch {
          if (cancelled) return;
          if (fromListUser) {
            otherUser = fromListUser;
          } else {
            otherUser = { id: userId, name: fallbackPeerName(userId), avatar: null };
          }
        }
      } else if (fromListUser) {
        otherUser = fromListUser;
      } else {
        otherUser = { id: userId!, name: fallbackPeerName(userId!), avatar: null };
      }

      if (cancelled) return;
      setActiveChat(user.id, otherUser);
      setPeerReady(true);
    })();

    return () => {
      cancelled = true;
      clearActiveChat();
      setPeerReady(false);
    };
  }, [user?.id, userId, roomIdParam, threadPeerId, setActiveChat, clearActiveChat, loadUsers, loadChats]);

  useEffect(() => {
    if (!user?.id || !threadPeerId) return;
    void ensureConnected(user.id);
  }, [user?.id, threadPeerId, ensureConnected]);

  useEffect(() => {
    // New chat opened -> allow initial scroll-to-bottom again.
    didInitialScrollRef.current = false;
    mediaAutoscrollUntilRef.current = 0;
    userTouchedScrollRef.current = false;
    pendingOlderScrollRestoreRef.current = null;
    setShowScrollToBottom(false);
  }, [threadPeerId]);

  const updateScrollToBottomVisibility = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    setShowScrollToBottom(distanceFromBottom > 140);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const scroller = scrollRef.current;
    updateScrollToBottomVisibility();
    if (!scroller || !user?.id) return;
    if (scroller.scrollTop > 100) return;
    const st = useChatStore.getState();
    if (!st.activeChatHasMoreOlder || st.isLoadingOlderMessages || st.isMessagesLoading) return;
    pendingOlderScrollRestoreRef.current = {
      prevScrollHeight: scroller.scrollHeight,
      prevScrollTop: scroller.scrollTop,
    };
    void st.loadOlderMessages(user.id);
  }, [user?.id, updateScrollToBottomVisibility]);

  useLayoutEffect(() => {
    if (isLoadingOlderMessages) return;
    const pending = pendingOlderScrollRestoreRef.current;
    if (!pending) return;
    pendingOlderScrollRestoreRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.scrollHeight - pending.prevScrollHeight;
    if (delta > 0) {
      el.scrollTop = pending.prevScrollTop + delta;
    }
  }, [activeChatMessages, isLoadingOlderMessages]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const bottom = bottomRef.current;
    if (!bottom) return;
    /** Пока нет ни одного сообщения — ждём; из кэша лента уже есть — скроллим к низу даже при догрузке с API. */
    if (isMessagesLoading && activeChatMessages.length === 0) return;

    if (!didInitialScrollRef.current) {
      // Wait until we actually have messages rendered; otherwise we "lock in" the flag too early.
      if (activeChatMessages.length === 0) return;
      didInitialScrollRef.current = true;
      bottom.scrollIntoView({ behavior: "auto" });
      // Коротко фиксируем "низ" после открытия, чтобы догрузка медиа не уводила от актуальных сообщений.
      mediaAutoscrollUntilRef.current = Date.now() + 2000;
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
    const onMediaReady = () => {
      const scroller = scrollRef.current;
      const bottom = bottomRef.current;
      if (!scroller || !bottom) return;
      if (Date.now() > mediaAutoscrollUntilRef.current) return;
      if (userTouchedScrollRef.current) return;

      // Во время краткой фиксации всегда держим низ, пока пользователь не начал скроллить вручную.
      bottom.scrollIntoView({ behavior: "auto" });
      updateScrollToBottomVisibility();
    };
    window.addEventListener("chatapp:media-ready", onMediaReady as EventListener);
    return () => window.removeEventListener("chatapp:media-ready", onMediaReady as EventListener);
  }, [updateScrollToBottomVisibility]);

  const markUserTouchedScroll = useCallback(() => {
    userTouchedScrollRef.current = true;
    mediaAutoscrollUntilRef.current = 0;
  }, []);

  /** Android WebView + клавиатура: иногда сдвигается scroll документа — композер «улетает» вверх. */
  const resetAndroidDocumentScroll = useCallback(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const run = () => {
      try {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch {
        /* noop */
      }
    };
    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 0);
    window.setTimeout(run, 80);
  }, []);

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

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHeaderMenuOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("[data-header-menu-root]")) {
        setHeaderMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    emojiKeyboardOpenRef.current = emojiKeyboardOpen;
  }, [emojiKeyboardOpen]);

  useEffect(() => {
    attachModalOpenRef.current = attachModalOpen;
    headerMenuOpenRef.current = headerMenuOpen;
    deleteModalOpenRef.current = deleteModalOpen;
    isDeletingChatRef.current = isDeletingChat;
  }, [attachModalOpen, headerMenuOpen, deleteModalOpen, isDeletingChat]);

  useEffect(() => {
    if (!emojiKeyboardOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiKeyboardOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emojiKeyboardOpen]);

  const leaveChat = useCallback(() => {
    // router.push("/") кладёт в историю второй «/» поверх чата — тогда жест «назад» на списке
    // возвращает в последний открытый чат. Нужно выталкивать чат из стека.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  const onAndroidBackButton = useCallback(
    ({ canGoBack }: BackButtonListenerEvent) => {
      if (isDeletingChatRef.current) return;
      if (messageMenu) {
        setMessageMenu(null);
        return;
      }
      if (deleteMessageTarget) {
        setDeleteMessageTarget(null);
        return;
      }
      if (deleteModalOpenRef.current) {
        setDeleteModalOpen(false);
        return;
      }
      if (headerMenuOpenRef.current) {
        setHeaderMenuOpen(false);
        return;
      }
      if (attachModalOpenRef.current) {
        setAttachModalOpen(false);
        return;
      }
      if (emojiKeyboardOpenRef.current) {
        setEmojiKeyboardOpen(false);
        return;
      }
      if (canGoBack) {
        router.back();
      } else {
        router.replace("/");
      }
    },
    [router, messageMenu, deleteMessageTarget]
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: PluginListenerHandle | undefined;
    void App.addListener("backButton", onAndroidBackButton).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, [onAndroidBackButton]);

  useEffect(() => {
    if (!emojiKeyboardOpen) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, [emojiKeyboardOpen]);

  useEffect(() => {
    if (attachModalOpen) setEmojiKeyboardOpen(false);
  }, [attachModalOpen]);

  const [presenceClock, bumpPresenceClock] = useState(0);
  useEffect(() => {
    if (!threadPeerId || !peerReady) return;
    const id = window.setInterval(() => bumpPresenceClock((t) => t + 1), 45000);
    return () => window.clearInterval(id);
  }, [threadPeerId, peerReady]);

  const isGroupChatEarly = !!(activeChatUser && isGroupThreadPeerId(activeChatUser.id));
  const activeGroupRow = useMemo(() => {
    if (!isGroupChatEarly || !activeRoomId) return null;
    return chats.find((c) => c.id === activeRoomId && c.roomType === "group") ?? null;
  }, [chats, isGroupChatEarly, activeRoomId]);
  const isGroupCreator = !!(user?.id && activeGroupRow && String(activeGroupRow.groupCreatedBy) === String(user.id));

  const flushTypingToServer = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    const rid = activeRoomId;
    if (rid && chatWebSocket.isConnected()) {
      chatWebSocket.send({ type: "typing", data: { room_id: rid, is_typing: false } });
    }
    lastTypingSentAtRef.current = 0;
  }, [activeRoomId]);

  const bumpComposerTyping = useCallback(() => {
    if (!activeRoomId || !chatWebSocket.isConnected()) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 2500) {
      lastTypingSentAtRef.current = now;
      chatWebSocket.send({ type: "typing", data: { room_id: activeRoomId, is_typing: true } });
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      lastTypingSentAtRef.current = 0;
      if (activeRoomId && chatWebSocket.isConnected()) {
        chatWebSocket.send({ type: "typing", data: { room_id: activeRoomId, is_typing: false } });
      }
    }, 2200);
  }, [activeRoomId]);

  useEffect(() => {
    const roomAtMount = activeRoomId;
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (roomAtMount && chatWebSocket.isConnected()) {
        chatWebSocket.send({ type: "typing", data: { room_id: roomAtMount, is_typing: false } });
      }
    };
  }, [activeRoomId]);

  const peerIsTyping = useMemo(() => {
    if (!isSocketConnected || !activeRoomId || !peerTyping) return false;
    if (peerTyping.roomId !== activeRoomId || peerTyping.until <= Date.now()) return false;
    const me = user?.id?.trim().toLowerCase() ?? "";
    if (peerTyping.userId.trim().toLowerCase() === me) return false;
    if (!isGroupChatEarly) {
      const peerId = (activeChatUser?.id ?? "").trim().toLowerCase();
      return peerId.length > 0 && peerTyping.userId.trim().toLowerCase() === peerId;
    }
    return true;
  }, [isSocketConnected, activeRoomId, peerTyping, user?.id, isGroupChatEarly, activeChatUser?.id]);

  const typingPresenceLabel = useMemo(() => {
    if (!peerIsTyping || !peerTyping) return null;
    if (!isGroupChatEarly) return "Печатает…";
    const map = activeGroupRow?.memberShortNameByUserId;
    const nm = map?.[peerTyping.userId.trim().toLowerCase()];
    return nm ? `${nm} печатает…` : "Печатает…";
  }, [peerIsTyping, peerTyping, isGroupChatEarly, activeGroupRow?.memberShortNameByUserId]);

  const resolveReactionAvatar = useCallback(
    (uid: string) => {
      const u = uid.trim().toLowerCase();
      const me = user?.id?.trim().toLowerCase();
      if (me && u === me) return user?.avatar ?? null;
      if (activeChatUser?.id && activeChatUser.id.trim().toLowerCase() === u) return activeChatUser.avatar ?? null;
      const m = activeGroupRow?.groupMembers?.find((x) => String(x.id).toLowerCase() === u);
      if (m?.avatar) return m.avatar;
      return null;
    },
    [user?.id, user?.avatar, activeChatUser?.id, activeChatUser?.avatar, activeGroupRow],
  );

  const submitMessageReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const rid = activeRoomId;
      const uid = user?.id;
      if (!rid || !uid || messageId.startsWith("msg_")) return;
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          setFileError("Нет авторизации — войдите снова.");
          return;
        }
        const res = await setMessageReaction(tokens.access_token, messageId, emoji);
        applyMessageReaction({
          roomId: rid,
          messageId,
          userId: uid,
          emoji: res.emoji,
          removed: res.removed,
        });
      } catch (e) {
        setFileError(e instanceof Error ? e.message : "Не удалось поставить реакцию");
      }
    },
    [activeRoomId, user?.id, applyMessageReaction],
  );

  const handleReactionChipFromBubble = useCallback(
    (messageId: string, emoji: string, chipUserId: string) => {
      const uid = user?.id;
      if (!uid || !activeRoomId || messageId.startsWith("msg_")) return;
      const me = uid.trim().toLowerCase();
      if (chipUserId.trim().toLowerCase() === me) {
        void submitMessageReaction(messageId, emoji);
        return;
      }
      const latest = useChatStore.getState().activeChatMessages.find((m) => m.id === messageId);
      const mine = latest?.reactions?.find((r) => String(r.userId).trim().toLowerCase() === me);
      if (mine?.emoji === emoji) return;
      void submitMessageReaction(messageId, emoji);
    },
    [activeRoomId, user?.id, submitMessageReaction],
  );

  if (!user || !threadPeerId) {
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

  if (!peerReady) {
    return (
      <AuthGuard requireAuth>
        <Layout>
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            <p className="text-sm">Загрузка профиля…</p>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    flushTypingToServer();
    setEmojiKeyboardOpen(false);
    await sendMessage(user.id, threadPeerId, text, undefined, replyingTo ?? undefined);
    setReplyingTo(null);
    setInput("");
  };

  const ingestFileForSend = (file: File) => {
    setFileError(null);
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      clearFileInputs();
      alertFileTooLarge(file.name);
      setFileError(`Файл «${file.name}» не отправлен: максимум ${maxAttachmentSizeLabelMb()} МБ`);
      return;
    }
    setEmojiKeyboardOpen(false);
    void (async () => {
      flushTypingToServer();
      await sendMessage(user.id, threadPeerId, input.trim(), { nativeFile: file }, replyingTo ?? undefined);
      setReplyingTo(null);
      setInput("");
      clearFileInputs();
    })();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    ingestFileForSend(file);
  };
  const clearFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const clearRecordHoldTimer = () => {
    if (recordHoldTimerRef.current != null) {
      clearTimeout(recordHoldTimerRef.current);
      recordHoldTimerRef.current = null;
    }
  };

  const startRecording = () => {
    if (micRequestInProgressRef.current) return;
    const mode = useCaptureModeStore.getState().captureMode;
    const native = typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();

    // Нативное приложение: только аудио через capacitor-audio-engine; видео — WebView + getUserMedia.
    if (native && mode === "audio") {
      micRequestInProgressRef.current = true;
      recordingWithNativeEngineRef.current = false;
      abandonNativeRecordRef.current = false;
      CapacitorAudioEngine.requestPermissions({
        showRationale: true,
        rationaleMessage:
          "Kindred нужен доступ к микрофону для голосовых сообщений и к уведомлениям (Android 13+).",
      })
        .then((perm) => {
          if (abandonNativeRecordRef.current) {
            micRequestInProgressRef.current = false;
            return;
          }
          if (!perm.granted) {
            micRequestInProgressRef.current = false;
            setFileError(
              "Разрешите «Микрофон» и «Уведомления» в диалоге выше. Либо нажмите на кнопку ещё раз — должен появиться запрос.",
            );
            return;
          }
          if (abandonNativeRecordRef.current) {
            micRequestInProgressRef.current = false;
            return;
          }
          return CapacitorAudioEngine.startRecording({ path: `audio_${Date.now()}.m4a` });
        })
        .then((result) => {
          if (abandonNativeRecordRef.current) {
            micRequestInProgressRef.current = false;
            return;
          }
          if (result === undefined) return;
          micRequestInProgressRef.current = false;
          recordingWithNativeEngineRef.current = true;
          setIsRecording(true);
        })
        .catch((err) => {
          micRequestInProgressRef.current = false;
          const msg = err?.message ?? String(err);
          const isPermissionDenied =
            /PERMISSION_DENIED|Permission denied|разрешени/i.test(msg) || msg === "PERMISSION_DENIED";
          setFileError(
            isPermissionDenied
              ? "Нужны разрешения: Микрофон и Уведомления. Нажмите на кнопку ещё раз — должен появиться системный запрос (диалог)."
              : `Не удалось начать запись: ${msg}.`,
          );
        });
      return;
    }

    // Браузер или нативное видео: getUserMedia + MediaRecorder.
    if (!navigator.mediaDevices?.getUserMedia) {
      setFileError("Камера и микрофон недоступны в этом окружении");
      return;
    }
    if (!("MediaRecorder" in window)) {
      setFileError("Запись медиа не поддерживается в этом окружении");
      return;
    }

    micRequestInProgressRef.current = true;
    recordingWithNativeEngineRef.current = false;

    const constraints: MediaStreamConstraints =
      mode === "video"
        ? {
            audio: true,
            video: videoCircleVideoConstraints(videoFacingModeRef.current, false),
          }
        : { audio: true };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(async (stream) => {
        micRequestInProgressRef.current = false;
        if (abandonNativeRecordRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (mode === "video") {
          flushSync(() => {
            setVideoRecordPhase("warmup");
            setIsRecording(true);
          });
          const videoEl = videoPreviewRef.current;
          if (!videoEl || abandonNativeRecordRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setVideoRecordPhase(null);
            setIsRecording(false);
            return;
          }
          try {
            videoEl.srcObject = stream;
            videoEl.muted = true;
            videoEl.playsInline = true;
            await waitForVideoReadyToRecord(videoEl);
          } catch {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setVideoRecordPhase(null);
            setIsRecording(false);
            setFileError("Камера подключилась, но превью не готово. Попробуйте ещё раз.");
            return;
          }
          if (abandonNativeRecordRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setVideoRecordPhase(null);
            setIsRecording(false);
            return;
          }
          const videoMime = pickBrowserVideoRecordingMime();
          const selectedMimeType = videoMime;
          let recorder: MediaRecorder;
          try {
            recorder = new MediaRecorder(stream, {
              ...(selectedMimeType ? { mimeType: selectedMimeType } : {}),
              videoBitsPerSecond: VIDEO_CIRCLE_RECORDER_VIDEO_BPS,
            });
          } catch {
            recorder = selectedMimeType
              ? new MediaRecorder(stream, { mimeType: selectedMimeType })
              : new MediaRecorder(stream);
          }
          mediaRecorderRef.current = recorder;
          chunksRef.current = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
          };
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            mediaRecorderRef.current = null;
            const blobType = recorder.mimeType || selectedMimeType || "video/webm";
            const blob = new Blob(chunksRef.current, { type: blobType });
            if (blob.size < MIN_RECORDED_MEDIA_BYTES) {
              recordHoldDidStartRef.current = false;
              finalizeRecordingLockRef.current = false;
              return;
            }
            const ext = fileExtensionForRecordedVideoMime(blobType);
            const name = `video-${Date.now()}.${ext}`;
            const recorded = new File([blob], name, { type: blobType });
            const ctx = sendRecordingCtxRef.current;
            if (recorded.size > MAX_CHAT_ATTACHMENT_BYTES) {
              alertFileTooLarge(name);
              setFileError(`Запись слишком большая (максимум ${maxAttachmentSizeLabelMb()} МБ).`);
            } else if (ctx.myId && ctx.peerId) {
              setEmojiKeyboardOpen(false);
              void sendMessage(ctx.myId, ctx.peerId, "", { nativeFile: recorded }, ctx.reply ?? undefined);
              setReplyingTo(null);
            }
            recordHoldDidStartRef.current = false;
            finalizeRecordingLockRef.current = false;
          };
          setVideoRecordPhase("recording");
          recorder.start(200);
          return;
        }

        const audioMime = pickBrowserRecordingMime();
        const selectedMimeType = audioMime;
        const recorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          mediaRecorderRef.current = null;
          const blobType = recorder.mimeType || selectedMimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: blobType });
          if (blob.size < MIN_RECORDED_MEDIA_BYTES) {
            recordHoldDidStartRef.current = false;
            finalizeRecordingLockRef.current = false;
            return;
          }
          const ext = fileExtensionForRecordedAudioMime(blobType);
          const name = `audio-${Date.now()}.${ext}`;
          const recorded = new File([blob], name, { type: blobType });
          const ctx = sendRecordingCtxRef.current;
          if (recorded.size > MAX_CHAT_ATTACHMENT_BYTES) {
            alertFileTooLarge(name);
            setFileError(`Запись слишком большая (максимум ${maxAttachmentSizeLabelMb()} МБ).`);
          } else if (ctx.myId && ctx.peerId) {
            setEmojiKeyboardOpen(false);
            void sendMessage(ctx.myId, ctx.peerId, "", { nativeFile: recorded }, ctx.reply ?? undefined);
            setReplyingTo(null);
          }
          recordHoldDidStartRef.current = false;
          finalizeRecordingLockRef.current = false;
        };
        recorder.start(200);
        setIsRecording(true);
      })
      .catch((err) => {
        micRequestInProgressRef.current = false;
        setVideoRecordPhase(null);
        setIsRecording(false);
        const details =
          err instanceof DOMException
            ? `${err.name}${err.message ? `: ${err.message}` : ""}`
            : err instanceof Error
              ? err.message
              : String(err);
        console.warn("Media recording failed:", err, "details:", details);
        const isNativeApp = typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
        const isMobile =
          typeof navigator !== "undefined" &&
          /Android|iPhone|iPad|iPod|webOS|Mobile/i.test(navigator.userAgent);
        const kind = mode === "video" ? "видео" : "аудио";
        const hint = !window.isSecureContext
          ? "На телефоне запись работает только по HTTPS (https://…)."
          : err instanceof DOMException &&
              (err.name === "NotAllowedError" || err.name === "SecurityError" || err.name === "PermissionDeniedError")
            ? isNativeApp
              ? `Разрешите доступ к ${mode === "video" ? "камере и микрофону" : "микрофону"} для приложения в системных настройках.`
              : isMobile
                ? `Разрешите ${mode === "video" ? "камеру и микрофон" : "микрофон"} для сайта (значок замка / настройки сайта в браузере).`
                : "В настройках браузера разрешите камеру и микрофон для этого сайта."
            : "Проверьте разрешения камеры и микрофона.";
        setFileError(`Не удалось записать ${kind}: ${details}. ${hint}`);
      });
  };

  const stopRecording = async () => {
    if (finalizeRecordingLockRef.current) return;
    if (
      !recordingWithNativeEngineRef.current &&
      videoRecordPhase === null &&
      !isRecording
    ) {
      return;
    }
    finalizeRecordingLockRef.current = true;
    abandonNativeRecordRef.current = true;
    if (recordingWithNativeEngineRef.current) {
      recordingWithNativeEngineRef.current = false;
      setIsRecording(false);
      try {
        const info = await CapacitorAudioEngine.stopRecording();
        const fileName = info.filename || info.path.replace(/^.*[/\\]/, "") || `audio-${Date.now()}.m4a`;
        const { data: base64 } = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Data,
        });
        const base64Str = typeof base64 === "string" ? base64 : "";
        const ctx = sendRecordingCtxRef.current;
        if (base64Str && ctx.myId && ctx.peerId) {
          const mime = info.mimeType || "audio/mp4";
          const blob = base64ToBlob(base64Str, mime);
          const recorded = new File([blob], info.filename || fileName, { type: mime });
          if (recorded.size > MAX_CHAT_ATTACHMENT_BYTES) {
            alertFileTooLarge(recorded.name);
            setFileError(`Запись слишком большая (максимум ${maxAttachmentSizeLabelMb()} МБ).`);
          } else {
            setEmojiKeyboardOpen(false);
            void sendMessage(ctx.myId, ctx.peerId, "", { nativeFile: recorded }, ctx.reply ?? undefined);
            setReplyingTo(null);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setFileError(`Не удалось сохранить запись: ${msg}`);
      }
      recordHoldDidStartRef.current = false;
      finalizeRecordingLockRef.current = false;
      queueMicrotask(() => {
        abandonNativeRecordRef.current = false;
      });
      return;
    }
    setVideoRecordPhase(null);
    let waitingForRecorderStop = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      waitingForRecorderStop = true;
      mediaRecorderRef.current.stop();
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    micRequestInProgressRef.current = false;
    setIsRecording(false);
    queueMicrotask(() => {
      abandonNativeRecordRef.current = false;
    });
    if (!waitingForRecorderStop) {
      finalizeRecordingLockRef.current = false;
    }
  };

  stopRecordingRef.current = stopRecording;

  const onRecordPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || isSending || !user?.id || !threadPeerId) return;
    if (isRecording || videoRecordPhase !== null) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      //
    }
    recordPointerDownRef.current = true;
    recordHoldDidStartRef.current = false;
    abandonNativeRecordRef.current = false;
    clearRecordHoldTimer();
    recordHoldTimerRef.current = setTimeout(() => {
      recordHoldTimerRef.current = null;
      if (!recordPointerDownRef.current) return;
      recordHoldDidStartRef.current = true;
      startRecording();
    }, RECORD_HOLD_DELAY_MS);
  };

  const onRecordPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    recordPointerDownRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      //
    }
    if (recordHoldTimerRef.current != null) {
      clearRecordHoldTimer();
      useCaptureModeStore.getState().toggleCaptureMode();
    }
    /* Запись не останавливаем по отпусканию — только кнопка «Отправить» в блоке аудио/видео. */
  };

  const displayName = activeChatUser?.name ?? "Пользователь";
  void presenceClock;
  const isGroupChat = isGroupChatEarly;
  const presenceLabel = isGroupChat
    ? "Групповой чат"
    : formatPeerPresenceLabel({
        isOnline: activeChatUser?.isOnline,
        lastSeenAt: activeChatUser?.lastSeenAt ?? null,
      });
  const groups = groupMessagesByDate(activeChatMessages);
  const hasMessages = activeChatMessages.length > 0;

  const handleDeleteChat = async () => {
    if (!activeRoomId) return;
    if (isGroupChat && !isGroupCreator) return;
    if (isDeletingChat) return;
    setIsDeletingChat(true);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      await deleteRoom(tokens.access_token, activeRoomId);
      removeChatByRoomId(activeRoomId);
      clearActiveChat();
      router.replace("/");
    } catch (e) {
      console.warn("deleteRoom failed:", e);
    } finally {
      setIsDeletingChat(false);
      setDeleteModalOpen(false);
    }
  };

  const openPeerProfile = () => {
    const peerId = activeChatUser?.id || userId;
    if (!peerId || isGroupThreadPeerId(peerId)) return;
    router.push(`/users/user?user_id=${encodeURIComponent(peerId)}`);
  };

  const onHeaderPeerClick = () => {
    if (isGroupChat && activeRoomId) {
      router.push(`/chat/group?roomId=${encodeURIComponent(activeRoomId)}`);
      return;
    }
    openPeerProfile();
  };

  const handleLeaveGroup = async () => {
    if (!activeRoomId || isLeavingGroup) return;
    setIsLeavingGroup(true);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      await leaveRoom(tokens.access_token, activeRoomId);
      removeChatByRoomId(activeRoomId);
      clearActiveChat();
      setLeaveGroupModalOpen(false);
      router.replace("/");
    } catch (e) {
      console.warn("leaveRoom failed:", e);
    } finally {
      setIsLeavingGroup(false);
    }
  };

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex h-full min-h-0 flex-col overflow-hidden relative">
          <header className="absolute w-full top-0 z-30 border-b border-white/10 bg-background/35 backdrop-blur-xl shadow-[0_10px_30px_-20px_rgba(0,0,0,0.6)] overflow-visible">
            <div className="absolute inset-0 overflow-hidden">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/0 to-background/40" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <div className="absolute -top-28 left-6 h-72 w-72 rounded-full bg-primary/18 blur-3xl" />
                <div className="absolute -top-24 right-10 h-64 w-64 rounded-full bg-white/12 blur-3xl" />
                <div className="absolute -bottom-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
              </div>
            </div>
            <div className="relative flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={leaveChat}
                className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Назад"
                title="Назад"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={onHeaderPeerClick}
                className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/35"
                aria-label={isGroupChat ? "Профиль группы" : "Открыть профиль собеседника"}
                title={isGroupChat ? "Профиль группы" : "Профиль"}
              >
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
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={onHeaderPeerClick}
                    className="font-semibold text-foreground truncate hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
                    title={isGroupChat ? "Профиль группы" : "Открыть профиль собеседника"}
                  >
                    {displayName}
                  </button>
                </div>
                <p
                  className={`mt-0.5 truncate text-xs ${
                    !isSocketConnected
                      ? "text-muted-foreground"
                      : peerIsTyping
                        ? "text-muted-foreground"
                        : activeChatUser?.isOnline
                          ? "font-medium text-primary"
                          : "text-muted-foreground"
                  }`}
                  aria-live={!isSocketConnected ? "polite" : undefined}
                  aria-busy={!isSocketConnected ? true : undefined}
                >
                  {!isSocketConnected ? (
                    <span className="inline-flex items-center gap-2">
                      <span>Соединение</span>
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                    </span>
                  ) : peerIsTyping && typingPresenceLabel ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.4} />
                      <span>{typingPresenceLabel}</span>
                    </span>
                  ) : (
                    presenceLabel
                  )}
                </p>
              </div>

              <div className="relative shrink-0" data-header-menu-root>
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen((v) => !v)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="Меню"
                  title="Меню"
                  aria-expanded={headerMenuOpen}
                  aria-haspopup="menu"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {headerMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-white/15 bg-background/70 backdrop-blur-xl shadow-xl"
                  >
                    {isGroupChat ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            if (activeRoomId) {
                              router.push(`/chat/group?roomId=${encodeURIComponent(activeRoomId)}`);
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
                        >
                          <Users className="h-4 w-4" />
                          Профиль группы
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setLeaveGroupModalOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
                        >
                          <LogOut className="h-4 w-4" />
                          Покинуть группу
                        </button>
                        {isGroupCreator ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setDeleteModalOpen(true);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-white/10 focus:outline-none focus:bg-white/10"
                          >
                            <Trash2 className="h-4 w-4" />
                            Удалить для всех
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setDeleteModalOpen(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-white/10 focus:outline-none focus:bg-white/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить чат
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {deleteModalOpen ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setDeleteModalOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Удалить чат"
                className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-background/70 backdrop-blur-xl shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-semibold text-foreground">
                  {isGroupChat ? "Удалить группу для всех?" : "Удалить чат?"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isGroupChat
                    ? "Сообщения и участники будут удалены. Это действие необратимо."
                    : "Данные чата будут удалены для обоих участников."}
                </p>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="Оставить"
                  >
                    Оставить
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteChat()}
                    disabled={isDeletingChat}
                    className="rounded-xl bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-destructive/50"
                    aria-label="Удалить"
                  >
                    {isDeletingChat ? "Удаляю..." : "Удалить"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {leaveGroupModalOpen ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => !isLeavingGroup && setLeaveGroupModalOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Покинуть группу"
                className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-background/70 backdrop-blur-xl shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-semibold text-foreground">Покинуть группу?</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Вы перестанете видеть чат в списке. Остальные участники сохранят переписку.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveGroupModalOpen(false)}
                    disabled={isLeavingGroup}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLeaveGroup()}
                    disabled={isLeavingGroup}
                    className="rounded-xl bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-60"
                  >
                    {isLeavingGroup ? "Выход…" : "Покинуть"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {messageMenu ? (
            <MessageActionsOverlay
              message={messageMenu.message}
              anchorRect={messageMenu.rect}
              onClose={() => setMessageMenu(null)}
              onReply={() =>
                setReplyingTo({
                  id: messageMenu.message.id,
                  preview: getMessagePreviewText(messageMenu.message.content, 50),
                })
              }
              onDelete={() => {
                setDeleteMessageTarget(messageMenu.message);
                setMessageMenu(null);
              }}
              canDelete={messageMenu.message.isOwn && !messageMenu.message.isUploading}
              roomId={activeRoomId}
              canReact={Boolean(activeRoomId) && !messageMenu.message.id.startsWith("msg_")}
              onPickReaction={(emoji) => {
                const msg = messageMenu.message;
                void submitMessageReaction(msg.id, emoji);
              }}
            />
          ) : null}

          {deleteMessageTarget ? (
            <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setDeleteMessageTarget(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Удалить сообщение"
                className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-background/70 backdrop-blur-xl shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-semibold text-foreground">Удалить сообщение?</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Сообщение будет удалено на сервере и исчезнет у всех участников чата.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isDeletingMessage}
                    onClick={() => setDeleteMessageTarget(null)}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingMessage}
                    onClick={() => {
                      void (async () => {
                        const target = deleteMessageTarget;
                        if (!target) return;
                        setIsDeletingMessage(true);
                        try {
                          const tokens = await getValidAuthTokens();
                          if (!tokens?.access_token) {
                            setFileError("Нет авторизации — войдите снова.");
                            return;
                          }
                          await deleteMessageOnServer(tokens.access_token, target.id);
                          removeMessageFromActiveChat(target.id);
                          setDeleteMessageTarget(null);
                        } catch (e) {
                          setFileError(
                            e instanceof Error ? e.message : "Не удалось удалить сообщение",
                          );
                        } finally {
                          setIsDeletingMessage(false);
                        }
                      })();
                    }}
                    className="rounded-xl bg-destructive px-3 py-2 text-sm text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50 disabled:opacity-50"
                  >
                    {isDeletingMessage ? "Удаление…" : "Удалить"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative flex-1 min-h-0 overflow-hidden">
            

            <div
              ref={scrollRef}
              onScroll={handleMessagesScroll}
              onWheel={markUserTouchedScroll}
              onTouchStart={markUserTouchedScroll}
              onPointerDown={markUserTouchedScroll}
              onClick={() => {
                if (emojiKeyboardOpen) setEmojiKeyboardOpen(false);
                if (messageMenu) setMessageMenu(null);
              }}
              className="no-scrollbar relative z-10 h-full overflow-y-auto overscroll-contain px-5 pt-20 sm:px-7"
              style={{
                paddingBottom: emojiKeyboardOpen
                  ? `calc(5rem + min(40dvh, 320px) + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`
                  : `calc(5rem + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
              }}
            >
              <div className="min-h-full flex flex-col justify-end space-y-4">
                {isMessagesLoading && !hasMessages && (
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
                {!messagesError && hasMessages && (
                  <>
                    {isMessagesLoading && (
                      <div className="flex justify-center items-center gap-2 py-2 text-muted-foreground text-xs">
                        <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                        <span>Обновление…</span>
                      </div>
                    )}
                    {isLoadingOlderMessages && (
                      <div className="flex justify-center py-3 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" aria-label="Загрузка сообщений" />
                      </div>
                    )}
                    {groups.length > 0 ? (
                      groups.map(({ date, messages }) => (
                        <div key={date}>
                          <div className="flex justify-center py-1.5">
                            <span className="rounded-full bg-muted/80 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground shadow-sm ring-1 ring-border/40 dark:bg-muted/50 dark:ring-white/10">
                              {date}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {messages.map((msg) => (
                              <ChatMessageBubble
                                key={String(msg.id)}
                                message={msg}
                                onSwipeReply={setReplyingTo}
                                dimmed={messageMenu !== null && messageMenu.message.id !== msg.id}
                                hideVisual={messageMenu !== null && messageMenu.message.id === msg.id}
                                onLongPress={(rect) => setMessageMenu({ message: msg, rect })}
                                resolveReactionAvatar={resolveReactionAvatar}
                                currentUserId={user.id}
                                groupIncomingAvatar={isGroupChatEarly}
                                onReactionChipClick={
                                  activeRoomId
                                    ? (emoji, chipUserId) => handleReactionChipFromBubble(msg.id, emoji, chipUserId)
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-2">
                        {activeChatMessages.map((msg) => (
                          <ChatMessageBubble
                            key={String(msg.id)}
                            message={msg}
                            onSwipeReply={setReplyingTo}
                            dimmed={messageMenu !== null && messageMenu.message.id !== msg.id}
                            hideVisual={messageMenu !== null && messageMenu.message.id === msg.id}
                            onLongPress={(rect) => setMessageMenu({ message: msg, rect })}
                            resolveReactionAvatar={resolveReactionAvatar}
                            currentUserId={user.id}
                            groupIncomingAvatar={isGroupChatEarly}
                            onReactionChipClick={
                              activeRoomId
                                ? (emoji, chipUserId) => handleReactionChipFromBubble(msg.id, emoji, chipUserId)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>

          {showScrollToBottom ? (
            <button
              type="button"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-background/50 text-primary shadow-lg backdrop-blur-xl hover:bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{
                bottom: emojiKeyboardOpen
                  ? `calc(6rem + min(40dvh, 320px) + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`
                  : `calc(6rem + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
              }}
              aria-label="Вниз"
              title="Вниз"
            >
              <ArrowDown size={18} />
            </button>
          ) : null}

          <div
            className="fixed inset-x-0 z-30 border-t border-white/10 bg-background/60 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)]"
            style={{ bottom: keyboardInset }}
          >
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

              {isRecording && captureMode === "audio" ? (
                <div
                  className="mb-2 rounded-xl border border-primary/35 bg-primary/8 px-3 py-2.5 dark:bg-primary/12"
                  role="status"
                  aria-live="polite"
                  aria-label={`Запись аудио, ${formatRecordingDuration(recordingDurationMs)}`}
                >
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatRecordingDuration(recordingDurationMs)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Кнопку записи можно отпустить. Завершите круглой кнопкой справа.
                        </span>
                      </div>
                      <div
                        className="flex h-11 w-full items-end justify-stretch gap-0.5 sm:gap-px"
                        aria-hidden
                      >
                        {audioMeterLevels.map((level, i) => (
                          <div
                            key={i}
                            className="min-w-0 flex-1 rounded-full bg-primary/80 dark:bg-primary/70"
                            style={{
                              height: `${Math.max(6, Math.min(100, level * 100))}%`,
                              minHeight: 3,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void stopRecording()}
                      disabled={isSending}
                      className="flex h-11 w-11 shrink-0 self-end items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
                      aria-label="Отправить голосовое сообщение"
                      title="Отправить"
                    >
                      <Send className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}

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
                    onImageFile={ingestFileForSend}
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
                    <EmojiKeyboardTrigger
                      open={emojiKeyboardOpen}
                      onPress={() => {
                        if (emojiKeyboardOpen) {
                          setEmojiKeyboardOpen(false);
                        } else {
                          inputRef.current?.blur();
                          setEmojiKeyboardOpen(true);
                        }
                      }}
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => {
                        const v = e.target.value;
                        setInput(v);
                        if (v.trim()) bumpComposerTyping();
                        else flushTypingToServer();
                      }}
                      onBlur={() => flushTypingToServer()}
                      onFocus={() => {
                        setEmojiKeyboardOpen(false);
                        resetAndroidDocumentScroll();
                      }}
                      placeholder="Сообщение..."
                      className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-2 pr-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                      enterKeyHint="send"
                      autoComplete="off"
                      autoCorrect="on"
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
                    ) : (
                      <button
                        type="button"
                        disabled={isSending}
                        onPointerDown={isRecording ? undefined : onRecordPointerDown}
                        onPointerUp={onRecordPointerUp}
                        onPointerCancel={onRecordPointerUp}
                        style={
                          isRecording && captureMode === "audio"
                            ? {
                                transform: "scale(1.08)",
                                transformOrigin: "center center",
                                transition: "transform 200ms ease-out",
                              }
                            : undefined
                        }
                        className={`flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 ${
                          isRecording
                            ? "min-w-[4.25rem] gap-1.5 border-2 border-destructive bg-background px-2.5 text-destructive dark:bg-background/80"
                            : "w-10 bg-primary text-primary-foreground"
                        }`}
                        aria-label={
                          isRecording
                            ? captureMode === "video" && videoRecordPhase === "recording"
                              ? `Идёт запись видео ${formatRecordingDuration(Math.min(recordingDurationMs, MAX_VIDEO_CIRCLE_RECORDING_MS))} из ${formatRecordingDuration(MAX_VIDEO_CIRCLE_RECORDING_MS)}. Отправка — в блоке записи выше.`
                              : `Идёт запись ${formatRecordingDuration(recordingDurationMs)}. Отправка — кнопка в блоке записи выше.`
                            : captureMode === "audio"
                              ? "Удерживайте для голосового; короткое нажатие — режим видео"
                              : "Удерживайте для видео; короткое нажатие — режим аудио"
                        }
                        title={
                          isRecording
                            ? captureMode === "video" && videoRecordPhase === "recording"
                              ? `Видео ${formatRecordingDuration(Math.min(recordingDurationMs, MAX_VIDEO_CIRCLE_RECORDING_MS))} / ${formatRecordingDuration(MAX_VIDEO_CIRCLE_RECORDING_MS)} — отправьте кнопкой в панели записи`
                              : `Запись ${formatRecordingDuration(recordingDurationMs)} — отправьте кнопкой в панели записи`
                            : captureMode === "audio"
                              ? "Удержать — голос. Тап — камера"
                              : "Удержать — видео. Тап — микрофон"
                        }
                      >
                        {isRecording ? (
                          <>
                            {captureMode === "audio" ? (
                              <Mic size={18} className="shrink-0 animate-pulse" aria-hidden />
                            ) : (
                              <Video size={18} className="shrink-0 animate-pulse" aria-hidden />
                            )}
                            <span className="tabular-nums text-xs font-semibold leading-none tracking-tight">
                              {captureMode === "video" && videoRecordPhase === "recording"
                                ? `${formatRecordingDuration(Math.min(recordingDurationMs, MAX_VIDEO_CIRCLE_RECORDING_MS))}/${formatRecordingDuration(MAX_VIDEO_CIRCLE_RECORDING_MS)}`
                                : formatRecordingDuration(recordingDurationMs)}
                            </span>
                          </>
                        ) : captureMode === "audio" ? (
                          <Mic size={20} aria-hidden />
                        ) : (
                          <Video size={20} aria-hidden />
                        )}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
            <EmojiKeyboardPanel
              open={emojiKeyboardOpen}
              onClose={() => setEmojiKeyboardOpen(false)}
              onSelect={(emoji) => {
                setInput((prev) => {
                  const next = prev + emoji;
                  if (next.trim()) queueMicrotask(() => bumpComposerTyping());
                  return next;
                });
              }}
            />
          </div>
        </div>
      </Layout>
      {videoRecordPhase !== null
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[10070] flex flex-col items-center justify-center gap-3 p-4">
              <div className="pointer-events-none absolute inset-0 bg-black/45 backdrop-blur-xl backdrop-saturate-150" />
              <div
                className={`relative z-10 m-3 aspect-square shrink-0 origin-center transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,height] ${
                  videoRecordPhase === "recording"
                    ? "h-[min(70vmin,92vw,88dvh)] w-[min(70vmin,92vw,88dvh)]"
                    : "h-[min(52vmin,88vw,78dvh)] w-[min(52vmin,88vw,78dvh)]"
                }`}
              >
                <div className="absolute inset-0 overflow-hidden rounded-full border-[3px] border-primary shadow-lg shadow-primary/25">
                  <video
                    ref={videoPreviewRef}
                    className={`pointer-events-none h-full w-full object-cover ${
                      videoFacingMode === "user" ? "[transform:scaleX(-1)]" : ""
                    }`}
                    playsInline
                    muted
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void flipVideoCamera()}
                  disabled={videoCameraFlipping}
                  className="pointer-events-auto absolute bottom-2 left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary/80 bg-background/95 text-primary shadow-lg backdrop-blur-md transition hover:bg-background active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 dark:bg-background/90 dark:text-primary"
                  aria-label={
                    videoFacingMode === "user"
                      ? "Переключить на основную камеру"
                      : "Переключить на фронтальную камеру"
                  }
                  title="Сменить камеру (можно вторым пальцем, не отпуская запись)"
                >
                  {videoCameraFlipping ? (
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                  ) : (
                    <SwitchCamera className="h-6 w-6" aria-hidden />
                  )}
                </button>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2.5">
                <p
                  className="pointer-events-none text-sm font-semibold tabular-nums text-white/95 drop-shadow-md"
                  aria-live="polite"
                >
                  {videoRecordPhase === "recording"
                    ? `${formatRecordingDuration(Math.min(recordingDurationMs, MAX_VIDEO_CIRCLE_RECORDING_MS))} / ${formatRecordingDuration(MAX_VIDEO_CIRCLE_RECORDING_MS)}`
                    : "Камера…"}
                </p>
                <p className="pointer-events-none max-w-[min(90vw,20rem)] text-center text-xs text-white/75 drop-shadow">
                  Отпустите палец — запись продолжается. Нажмите «Отправить», чтобы завершить. Максимум{" "}
                  {formatRecordingDuration(MAX_VIDEO_CIRCLE_RECORDING_MS)} — дальше запись остановится сама.
                </p>
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  disabled={isSending}
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  aria-label="Отправить видеосообщение"
                >
                  <Send className="h-4 w-4 shrink-0" aria-hidden />
                  Отправить
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
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
