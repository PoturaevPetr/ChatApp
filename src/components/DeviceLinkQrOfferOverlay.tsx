"use client";

import { createPortal } from "react-dom";
import { Link2, X } from "lucide-react";

type DeviceLinkQrOfferOverlayProps = {
  open: boolean;
  onClose: () => void;
  qrDataUrl: string | null;
  code: string | null;
  hint?: string;
};

/**
 * Fullscreen QR for kindred-link (trusted device → new device scans on login).
 */
export function DeviceLinkQrOfferOverlay({
  open,
  onClose,
  qrDataUrl,
  code,
  hint = "На новом устройстве: вход → Сканировать QR",
}: DeviceLinkQrOfferOverlayProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10070] flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Link2 size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">QR для нового устройства</p>
            <p className="truncate text-xs text-muted-foreground">Покажите или отправьте код</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-muted/50 p-2 text-foreground hover:bg-muted"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <div className="text-center">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR для входа на новом устройстве"
                className="mx-auto h-[min(56vw,240px)] w-[min(56vw,240px)] rounded-xl bg-white p-3"
              />
            ) : (
              <div className="mx-auto flex h-[min(56vw,240px)] w-[min(56vw,240px)] items-center justify-center rounded-xl bg-muted/30 text-sm text-muted-foreground">
                Генерация QR…
              </div>
            )}
            {code ? (
              <p className="mt-4 font-mono text-2xl tracking-[0.2em] text-foreground">{code}</p>
            ) : null}
          </div>
          <p className="mt-4 text-center text-sm leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
