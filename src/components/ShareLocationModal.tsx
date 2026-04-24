"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { ChatLeafletMap } from "@/components/chat/ChatLeafletMap";

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lng: number };

export function ShareLocationModal({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (lat: number, lng: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  useEffect(() => {
    setMounted(true);
  }, []);

  const requestPosition = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", message: "Геолокация недоступна в этом окружении." });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        const code = err.code === 1 ? "Доступ к геолокации запрещён." : "Не удалось определить местоположение.";
        setGeo({ status: "error", message: code });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setGeo({ status: "idle" });
      return;
    }
    requestPosition();
  }, [open, requestPosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSend = () => {
    if (geo.status !== "ok") return;
    onSend(geo.lat, geo.lng);
    onClose();
  };

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="pointer-events-auto fixed inset-0 z-[10055] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-loc-title"
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
        <div className="shrink-0">
          <div className="flex justify-center pt-3 pb-1">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          </div>
          <h2 id="share-loc-title" className="px-4 text-center text-lg font-semibold text-foreground">
            Геопозиция
          </h2>
          <p className="mt-0.5 px-4 pb-1 text-center text-xs text-muted-foreground">
            Точка на карте будет отправлена как сообщение (без отслеживания в реальном времени).
          </p>
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col px-4 pb-4">
          {geo.status === "loading" || geo.status === "idle" ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
              <p className="text-sm">Определяем координаты…</p>
            </div>
          ) : null}

          {geo.status === "error" ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
              <p className="text-sm text-destructive">{geo.message}</p>
              <button
                type="button"
                onClick={() => requestPosition()}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Повторить
              </button>
            </div>
          ) : null}

          {geo.status === "ok" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="chat-leaflet-chat relative min-h-[200px] flex-1 overflow-hidden rounded-2xl border border-border bg-muted/20">
                <ChatLeafletMap
                  lat={geo.lat}
                  lng={geo.lng}
                  className="absolute inset-0 h-full w-full min-h-[180px]"
                />
              </div>
              <p className="shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">
                {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  Отправить
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
