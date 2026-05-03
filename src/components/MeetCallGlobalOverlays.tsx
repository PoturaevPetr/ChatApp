"use client";

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PhoneIncoming, PhoneOff, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import { MeetCallContext } from "@/contexts/MeetCallContext";
import { useChatStore } from "@/stores/chatStore";
import { meetCalleeDisplayName, fallbackPeerName } from "@/lib/meetDisplayName";
import {
  startMeetIncomingRingSound,
  startMeetOutgoingRingSound,
  stopMeetCallSounds,
} from "@/lib/meetCallSounds";

function formatCallDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Секунды от startedAtMs; пересчёт на каждом рендере + тик раз в секунду (не ждём эффект для первого кадра). */
function useElapsedSeconds(startedAtMs: number | undefined): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAtMs == null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  if (startedAtMs == null) return 0;
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

/**
 * Полноэкранные звонки поверх любого экрана + скрытый audio для удалённого потока.
 */
export function MeetCallGlobalOverlays() {
  const meet = useContext(MeetCallContext);
  const chats = useChatStore((s) => s.chats);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [speakerOn, setSpeakerOn] = useState(false);

  const snap = meet?.snapshot;
  const phase = snap?.phase;

  useEffect(() => {
    if (phase === "outgoing_ringing") {
      void startMeetOutgoingRingSound();
      return () => stopMeetCallSounds();
    }
    if (phase === "incoming") {
      void startMeetIncomingRingSound();
      return () => stopMeetCallSounds();
    }
    stopMeetCallSounds();
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase !== "in_call") {
      setSpeakerOn(false);
    }
  }, [phase]);

  useEffect(() => {
    const el = audioRef.current;
    const stream = meet?.snapshot.remoteStream ?? null;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      el.muted = false;
      el.volume = 1;
      void el.play().catch(() => {});
    }
  }, [meet?.snapshot.remoteStream]);

  /** Громкая связь: выбор динамика через setSinkId, если браузер/WebView поддерживает. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || phase !== "in_call" || typeof el.setSinkId !== "function") return;
    if (!speakerOn) {
      void el.setSinkId("").catch(() => {});
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devs) => {
        if (cancelled) return;
        const outs = devs.filter((d) => d.kind === "audiooutput");
        const loud =
          outs.find((d) => /speaker|динамик|loudspeaker|lautsprecher/i.test(d.label)) ?? outs[outs.length - 1];
        if (loud?.deviceId) {
          void el.setSinkId(loud.deviceId).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [speakerOn, phase, meet?.snapshot.remoteStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    const stream = meet?.snapshot.remoteStream ?? null;
    const hasVideo = !!meet?.snapshot.remoteHasVideo;
    if (!el) return;
    if (hasVideo && stream) {
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [meet?.snapshot.remoteStream, meet?.snapshot.remoteHasVideo]);

  useEffect(() => {
    const el = localVideoRef.current;
    const stream = meet?.snapshot.localStream ?? null;
    if (!el) return;
    if (stream?.getVideoTracks().length) {
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [meet?.snapshot.localStream]);

  const remoteId = (snap?.remoteUserId ?? "").trim();
  const peer = useMemo(() => {
    if (!remoteId) return { name: "Собеседник", avatar: null as string | null };
    const low = remoteId.toLowerCase();
    const row = chats.find((c) => String(c.otherUser.id).trim().toLowerCase() === low);
    if (!row) return { name: fallbackPeerName(remoteId), avatar: null as string | null };
    return { name: row.otherUser.name, avatar: row.otherUser.avatar ?? null };
  }, [chats, remoteId]);

  const nameLines = useMemo(() => meetCalleeDisplayName(peer.name), [peer.name]);
  const callElapsedSec = useElapsedSeconds(snap?.callConnectedAtMs);
  const supportsSetSink =
    typeof window !== "undefined" &&
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype;

  const showIncoming = meet && phase === "incoming" && !!snap?.callId;
  const showOutgoing = meet && phase === "outgoing_ringing";
  const showInCall = meet && phase === "in_call";

  const localCamOn = !!snap?.localStream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

  const meetErr =
    (meet?.snapshot.phase === "error" && meet.snapshot.errorMessage?.trim()) ||
    meet?.configError?.trim() ||
    "";

  const z = "z-[95]";

  let overlay: ReactNode = null;
  if (showIncoming && snap) {
    overlay = (
      <div
        className={`fixed inset-0 ${z} flex flex-col bg-background/97 backdrop-blur-xl`}
        role="alertdialog"
        aria-modal="true"
        aria-label={snap.meetMedia === "video" ? "Входящий видеозвонок" : "Входящий звонок"}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-2 rounded-full bg-gradient-to-br from-primary/35 via-transparent to-primary/15 blur-xl"
              aria-hidden
            />
            <div className="relative flex h-32 w-32 overflow-hidden rounded-full border-2 border-white/20 bg-muted shadow-2xl">
              {peer.avatar ? (
                <img src={peer.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-primary">
                  {peer.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 max-w-[min(100%,20rem)] text-center">
            <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{nameLines.firstLine}</p>
            {nameLines.secondLine ? (
              <p className="mt-2 text-xl font-medium leading-tight text-muted-foreground">{nameLines.secondLine}</p>
            ) : null}
            {snap.meetMedia === "video" ? (
              <p className="mt-4 text-base text-muted-foreground">Видеозвонок</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-center gap-16 px-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={() => {
              const id = snap.callId;
              if (id) meet!.rejectIncoming(id);
            }}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-red-600/25 transition hover:bg-red-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
            aria-label="Сбросить вызов"
          >
            <PhoneOff className="h-8 w-8" strokeWidth={2.2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              const id = snap.callId;
              if (id) void meet!.acceptIncoming(id);
            }}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-600/25 transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50"
            aria-label="Принять вызов"
          >
            <PhoneIncoming className="h-8 w-8" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>
    );
  } else if (showOutgoing && meet && snap) {
    overlay = (
      <div
        className={`fixed inset-0 ${z} flex flex-col bg-background/97 backdrop-blur-xl`}
        role="dialog"
        aria-modal="true"
        aria-label={snap.meetMedia === "video" ? "Исходящий видеозвонок" : "Исходящий звонок"}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-2 rounded-full bg-gradient-to-br from-primary/35 via-transparent to-primary/15 blur-xl"
              aria-hidden
            />
            <div className="relative flex h-32 w-32 overflow-hidden rounded-full border-2 border-white/20 bg-muted shadow-2xl">
              {peer.avatar ? (
                <img src={peer.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-primary">
                  {peer.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 max-w-[min(100%,20rem)] text-center">
            <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{nameLines.firstLine}</p>
            {nameLines.secondLine ? (
              <p className="mt-2 text-xl font-medium leading-tight text-muted-foreground">{nameLines.secondLine}</p>
            ) : null}
          </div>
          <p className="mt-8 text-base text-muted-foreground">
            {snap.meetMedia === "video" ? "Видеовызов…" : "Вызов…"}
          </p>
        </div>
        <div className="flex shrink-0 justify-center pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={() => meet.hangup()}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-red-600/25 transition hover:bg-red-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
            aria-label="Отменить вызов"
          >
            <PhoneOff className="h-8 w-8" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>
    );
  } else if (showInCall && meet && snap) {
    const showRemoteVideo = !!snap.remoteHasVideo;
    const showLocalPip = localCamOn;
    overlay = (
      <div
        className={`fixed inset-0 ${z} flex flex-col bg-background/97 backdrop-blur-xl`}
        role="dialog"
        aria-modal="true"
        aria-label="Разговор"
      >
        <div className="relative flex min-h-0 flex-1 flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {showRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              className="mx-auto mt-1 max-h-[min(42vh,22rem)] w-full max-w-lg rounded-xl border border-white/15 bg-black object-cover shadow-xl"
              playsInline
              autoPlay
              muted
              aria-label="Видео собеседника"
            />
          ) : null}
          <div
            className={`flex min-h-0 flex-1 flex-col items-center justify-center px-4 ${showRemoteVideo ? "pt-3" : ""}`}
          >
            {!showRemoteVideo ? (
              <div className="relative shrink-0">
                <div
                  className="absolute -inset-2 rounded-full bg-gradient-to-br from-emerald-500/25 via-transparent to-primary/15 blur-xl"
                  aria-hidden
                />
                <div className="relative flex h-32 w-32 overflow-hidden rounded-full border-2 border-emerald-500/40 bg-muted shadow-2xl">
                  {peer.avatar ? (
                    <img src={peer.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-primary">
                      {peer.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className={`max-w-[min(100%,20rem)] text-center ${showRemoteVideo ? "mt-3" : "mt-8"}`}>
              <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{nameLines.firstLine}</p>
              {nameLines.secondLine ? (
                <p className="mt-2 text-xl font-medium leading-tight text-muted-foreground">{nameLines.secondLine}</p>
              ) : null}
            </div>
            <p
              className="mt-4 font-mono text-3xl font-semibold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400"
              aria-live="polite"
            >
              {formatCallDuration(callElapsedSec)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Длительность звонка</p>
          </div>
          {showLocalPip ? (
            <div className="pointer-events-none absolute bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-4 z-[1] w-[7.5rem] overflow-hidden rounded-xl border-2 border-white/25 bg-black shadow-2xl">
              <video ref={localVideoRef} className="aspect-[3/4] h-auto w-full object-cover" playsInline autoPlay muted />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-3 px-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void meet.setLocalCameraEnabled(!localCamOn)}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-muted/80 text-foreground shadow-md transition hover:bg-muted"
              aria-pressed={localCamOn}
              aria-label={localCamOn ? "Выключить камеру" : "Включить камеру"}
              title={localCamOn ? "Выключить камеру" : "Включить камеру"}
            >
              {localCamOn ? <Video className="h-7 w-7" aria-hidden /> : <VideoOff className="h-7 w-7" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => setSpeakerOn((v) => !v)}
              disabled={!supportsSetSink}
              title={supportsSetSink ? "Переключить громкую связь" : "Громкая связь недоступна в этом браузере"}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-muted/80 text-foreground shadow-md transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-pressed={speakerOn}
              aria-label="Громкая связь"
            >
              {speakerOn ? <Volume2 className="h-7 w-7" aria-hidden /> : <VolumeX className="h-7 w-7" aria-hidden />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => meet.hangup()}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-red-600/25 transition hover:bg-red-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
            aria-label="Завершить звонок"
          >
            <PhoneOff className="h-8 w-8" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <audio ref={audioRef} className="sr-only" playsInline autoPlay aria-hidden />
      {overlay}
      {meetErr ? (
        <div
          className={`pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 ${z} rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-2 text-center text-xs text-destructive`}
          role="status"
        >
          {meetErr}
        </div>
      ) : null}
    </>
  );
}
