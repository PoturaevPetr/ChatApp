"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { QrCode, ScanLine, X } from "lucide-react";
import { scanDeviceLinkQr } from "@/lib/deviceLinkQr";

/** Выше ProfileDevicesSheet / AttachFileModal (10050–10060). */
const SCANNER_OVERLAY_Z = 10070;

type DeviceLinkQrScannerOverlayProps = {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  onError?: (message: string) => void;
  hint?: string;
};

function mountVideoPreview(host: HTMLDivElement, video: HTMLVideoElement) {
  host.replaceChildren();
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.autoplay = true;
  video.muted = true;
  video.className = "absolute inset-0 h-full w-full object-cover";
  host.appendChild(video);
}

function ViewfinderOverlay() {
  const cornerClass =
    "absolute h-7 w-7 border-white/90 sm:h-8 sm:w-8";

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 sm:p-10">
      <div className="relative aspect-square w-full max-w-[min(78vw,340px)] rounded-[1.75rem] shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]">
        <span aria-hidden className={`${cornerClass} left-0 top-0 rounded-tl-[1.25rem] border-l-[3px] border-t-[3px]`} />
        <span aria-hidden className={`${cornerClass} right-0 top-0 rounded-tr-[1.25rem] border-r-[3px] border-t-[3px]`} />
        <span aria-hidden className={`${cornerClass} bottom-0 left-0 rounded-bl-[1.25rem] border-b-[3px] border-l-[3px]`} />
        <span aria-hidden className={`${cornerClass} bottom-0 right-0 rounded-br-[1.25rem] border-b-[3px] border-r-[3px]`} />

        <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/80 to-transparent opacity-70 animate-pulse" />
      </div>
    </div>
  );
}

function ScannerHintCard({ hint }: { hint: string }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/15 bg-black/55 px-4 py-3.5 shadow-lg shadow-black/30 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/25">
            <ScanLine size={20} aria-hidden />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-medium leading-snug text-white">{hint}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/65">
              Держите камеру ровно — QR-код должен полностью попадать в рамку
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fullscreen rear-camera QR scanner (mobile auth / approve login on trusted device).
 */
export function DeviceLinkQrScannerOverlay({
  open,
  onClose,
  onCode,
  onError,
  hint = "Наведите камеру на QR-код",
}: DeviceLinkQrScannerOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      if (hostRef.current) hostRef.current.replaceChildren();
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;

    void scanDeviceLinkQr({
      signal: ac.signal,
      timeoutMs: 120_000,
      onVideoReady: (video) => {
        const attach = () => {
          const host = hostRef.current;
          if (!host) return false;
          mountVideoPreview(host, video);
          return true;
        };
        if (!attach()) {
          requestAnimationFrame(() => {
            if (!cancelled && !ac.signal.aborted) attach();
          });
        }
      },
    })
      .then((code) => {
        if (cancelled || ac.signal.aborted) return;
        onCode(code);
        onClose();
      })
      .catch((e) => {
        if (cancelled || ac.signal.aborted) return;
        onError?.(e instanceof Error ? e.message : "Ошибка камеры");
      });

    return () => {
      cancelled = true;
      ac.abort();
      if (hostRef.current) hostRef.current.replaceChildren();
    };
  }, [open, onClose, onCode, onError]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black"
      style={{ zIndex: SCANNER_OVERLAY_Z }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/10">
            <QrCode size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">Сканирование QR</p>
            <p className="truncate text-xs text-white/60">Kindred · привязка устройства</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-white/12 p-2 text-white ring-1 ring-white/10 transition hover:bg-white/20"
          aria-label="Закрыть камеру"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div ref={hostRef} className="absolute inset-0" />
        <ViewfinderOverlay />
      </div>

      <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ScannerHintCard hint={hint} />
      </div>
    </div>,
    document.body,
  );
}
