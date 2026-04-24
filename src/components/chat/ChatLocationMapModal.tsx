"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ChatLeafletMap } from "@/components/chat/ChatLeafletMap";

export function ChatLocationMapModal({
  open,
  lat,
  lng,
  onClose,
  title = "Карта",
}: {
  open: boolean;
  lat: number;
  lng: number;
  onClose: () => void;
  title?: string;
}) {
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

  if (!open || !mounted) return null;

  const titleId = "chat-location-map-modal-title";

  const overlay = (
    <div
      className="pointer-events-auto fixed inset-0 z-[10060] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden
      />
      <div
        className="relative flex h-[80dvh] w-full min-h-0 flex-col overflow-hidden rounded-t-3xl border-t border-border bg-card shadow-[0_-8px_32px_rgba(0,0,0,0.12)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 px-4 pb-2">
          <div className="flex justify-center pt-3 pb-1">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 z-[1] flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id={titleId} className="px-10 pt-1 text-center text-lg font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-center text-[11px] text-muted-foreground tabular-nums">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        </div>

        <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col sm:mx-4 sm:mb-4">
          <div className="chat-leaflet-chat relative min-h-[200px] flex-1 overflow-hidden rounded-2xl border border-border bg-muted/20">
            <ChatLeafletMap lat={lat} lng={lng} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
