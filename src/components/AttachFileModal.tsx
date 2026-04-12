"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import type { MediaAsset } from "@capacitor-community/media";
import { fetchRecentGalleryMedias, mediaAssetToSendableFile, mediaThumbSrc } from "@/lib/galleryMedia";

interface AttachFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Системный захват камеры (fallback, если нет превью). */
  onTakePhoto: () => void;
  onUploadFile: () => void;
  onImageFile: (file: File) => void;
}

const ANIMATION_MS = 300;
/** Сколько недавних фото запросить при открытии модалки. */
const GALLERY_INITIAL = 15;
/** На сколько увеличивать quantity при подгрузке по скроллу. */
const GALLERY_PAGE = 20;

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function AttachFileModal({
  isOpen,
  onClose,
  onTakePhoto,
  onUploadFile,
  onImageFile,
}: AttachFileModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [canAct, setCanAct] = useState(false);
  const [gallery, setGallery] = useState<MediaAsset[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [lastGalleryQuantity, setLastGalleryQuantity] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [fullscreenCamera, setFullscreenCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fullVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryLoadMoreBusyRef = useRef(false);

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    streamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setCanAct(false);
      setFullscreenCamera(false);
      setCameraDenied(false);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      const allowAct = setTimeout(() => setCanAct(true), 400);
      return () => {
        cancelAnimationFrame(start);
        clearTimeout(allowAct);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setGallery([]);
    setGalleryHasMore(false);
    setLastGalleryQuantity(0);
    setGalleryLoading(true);
    const qty = GALLERY_INITIAL;
    void fetchRecentGalleryMedias(qty)
      .then((items) => {
        if (cancelled) return;
        setGallery(items);
        setLastGalleryQuantity(qty);
        setGalleryHasMore(items.length === qty);
      })
      .catch(() => {
        if (!cancelled) {
          setGallery([]);
          setGalleryHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setGalleryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const loadMoreGallery = useCallback(() => {
    if (
      !Capacitor.isNativePlatform() ||
      galleryLoading ||
      !galleryHasMore ||
      galleryLoadMoreBusyRef.current
    ) {
      return;
    }
    const nextQty = lastGalleryQuantity + GALLERY_PAGE;
    galleryLoadMoreBusyRef.current = true;
    setGalleryLoadingMore(true);
    void fetchRecentGalleryMedias(nextQty)
      .then((items) => {
        setGallery(items);
        setLastGalleryQuantity(nextQty);
        setGalleryHasMore(items.length === nextQty);
      })
      .catch(() => {
        setGalleryHasMore(false);
      })
      .finally(() => {
        setGalleryLoadingMore(false);
        galleryLoadMoreBusyRef.current = false;
      });
  }, [galleryLoading, galleryHasMore, lastGalleryQuantity]);

  const onGalleryScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      if (nearBottom) loadMoreGallery();
    },
    [loadMoreGallery],
  );

  useEffect(() => {
    if (!isOpen || !isVisible || isExiting) return;
    let alive = true;
    let obtained: MediaStream | null = null;
    (async () => {
      try {
        obtained = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          stopStream(obtained);
          return;
        }
        setCameraStream(obtained);
        setCameraDenied(false);
      } catch {
        setCameraDenied(true);
        try {
          obtained = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });
          if (!alive) {
            stopStream(obtained);
            return;
          }
          setCameraStream(obtained);
          setCameraDenied(false);
        } catch {
          setCameraDenied(true);
        }
      }
    })();
    return () => {
      alive = false;
      stopStream(obtained);
      setCameraStream(null);
    };
  }, [isOpen, isVisible, isExiting]);

  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el || !cameraStream) return;
    el.srcObject = cameraStream;
    void el.play().catch(() => {});
  }, [cameraStream, isVisible]);

  useEffect(() => {
    const el = fullVideoRef.current;
    if (!el || !cameraStream || !fullscreenCamera) return;
    el.srcObject = cameraStream;
    void el.play().catch(() => {});
  }, [cameraStream, fullscreenCamera]);

  const finishAndClose = useCallback(
    (fn: () => void) => {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        stopStream(streamRef.current);
        setCameraStream(null);
        onClose();
        fn();
      }, ANIMATION_MS);
    },
    [onClose]
  );

  const handleClose = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!isVisible) return;
    finishAndClose(() => {});
  };

  const handleCapturePhoto = useCallback(() => {
    const video = fullVideoRef.current || previewVideoRef.current;
    if (!video || video.videoWidth <= 0) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          setCapturing(false);
          if (!blob) return;
          const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
          setFullscreenCamera(false);
          finishAndClose(() => onImageFile(file));
        },
        "image/jpeg",
        0.92
      );
    } catch {
      setCapturing(false);
    }
  }, [finishAndClose, onImageFile]);

  const openPreviewTap = () => {
    if (!isVisible || !canAct) return;
    if (cameraDenied || !cameraStream) {
      finishAndClose(() => onTakePhoto());
      return;
    }
    setFullscreenCamera(true);
  };

  const closeFullscreen = () => setFullscreenCamera(false);

  const handleGalleryPick = async (asset: MediaAsset, fileIndex: number) => {
    if (!canAct || pickingId) return;
    setPickingId(asset.identifier);
    try {
      const file = await mediaAssetToSendableFile(asset, fileIndex);
      finishAndClose(() => onImageFile(file));
    } catch (e) {
      console.warn("[AttachFileModal] gallery pick:", e);
      setPickingId(null);
    }
  };

  if (!isOpen || !portalReady) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[10050] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attach-modal-title"
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible && !isExiting ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (fullscreenCamera) closeFullscreen();
          else handleClose();
        }}
        aria-hidden
      />
      <div
        className="relative w-full max-h-[min(85dvh,640px)] overflow-hidden rounded-t-3xl border-t border-border bg-card shadow-[0_-8px_32px_rgba(0,0,0,0.12)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] transition-transform ease-out"
        style={{
          transitionDuration: `${ANIMATION_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        </div>
        <h2 id="attach-modal-title" className="px-4 text-center text-lg font-semibold text-foreground">
          Прикрепить файл
        </h2>
        <p className="mt-0.5 px-4 text-center text-xs text-muted-foreground">
          Камера · недавние фото · или файл с диска
        </p>

        <div
          className="mt-3 max-h-[min(58dvh,480px)] overflow-y-auto overscroll-contain px-3"
          onScroll={onGalleryScroll}
        >
          {/* Первая строка: камера ровно 25% ширины (1/4 сетки), даже без фото в галерее */}
          <div className="mb-1.5 grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={openPreviewTap}
              className="relative aspect-square w-full overflow-hidden rounded-xl bg-black focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={cameraDenied ? "Открыть камеру" : "Снимок на весь экран"}
            >
              {cameraStream && !cameraDenied ? (
                <video ref={previewVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/40 p-0.5 text-[9px] leading-tight text-muted-foreground">
                  <ImagePlus className="h-6 w-6 shrink-0 opacity-60" />
                  <span className="px-0.5 text-center">Камера</span>
                </div>
              )}
            </button>
            {galleryLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`sk-top-${i}`}
                    className="aspect-square w-full animate-pulse rounded-xl bg-muted/50"
                    aria-hidden
                  />
                ))
              : gallery.slice(0, 3).map((asset, i) => {
                  const src = mediaThumbSrc(asset);
                  const index = i;
                  return (
                    <button
                      key={asset.identifier}
                      type="button"
                      disabled={pickingId !== null}
                      onClick={() => void handleGalleryPick(asset, index)}
                      className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:opacity-50"
                      aria-label="Выбрать фото"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-muted/40">
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      {pickingId === asset.identifier ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                          <Loader2 className="h-7 w-7 animate-spin text-white" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
          </div>

          {Capacitor.isNativePlatform() ? (
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Недавние фото</p>
          ) : null}

          <div className="grid grid-cols-4 gap-1.5">
            {galleryLoading
              ? Array.from({ length: GALLERY_INITIAL - 3 }).map((_, i) => (
                  <div
                    key={`sk-${i}`}
                    className="aspect-square w-full animate-pulse rounded-xl bg-muted/50"
                    aria-hidden
                  />
                ))
              : gallery.slice(3).map((asset, j) => {
                  const src = mediaThumbSrc(asset);
                  const index = 3 + j;
                  return (
                    <button
                      key={asset.identifier}
                      type="button"
                      disabled={pickingId !== null}
                      onClick={() => void handleGalleryPick(asset, index)}
                      className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:opacity-50"
                      aria-label="Выбрать фото"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-muted/40">
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      {pickingId === asset.identifier ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                          <Loader2 className="h-7 w-7 animate-spin text-white" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
          </div>

          {galleryLoadingMore ? (
            <div className="mt-2 flex justify-center py-2" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : null}

          {Capacitor.isNativePlatform() && !galleryLoading && gallery.length === 0 ? (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Нет фото в галерее или нет доступа. Выберите файл с диска ниже.
            </p>
          ) : null}

          {!Capacitor.isNativePlatform() && !galleryLoading ? (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              В браузере список недавних фото недоступен — откройте приложение или выберите файл ниже.
            </p>
          ) : null}
        </div>

        <div className="mt-2 flex flex-col gap-2 px-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isVisible || !canAct) return;
              finishAndClose(() => onUploadFile());
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 py-3 text-sm font-medium text-foreground hover:bg-muted/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
          >
            <Upload className="h-4 w-4" />
            Загрузить с диска
          </button>
          <button
            type="button"
            onClick={(e) => handleClose(e)}
            className="w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-inset rounded-xl"
          >
            Отмена
          </button>
        </div>
      </div>

      {fullscreenCamera ? (
        <div
          className="fixed inset-0 z-[10060] flex flex-col bg-black"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            <span className="text-sm font-medium text-white/90">Снимок</span>
            <button
              type="button"
              onClick={closeFullscreen}
              className="rounded-full p-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
              aria-label="Закрыть"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <video ref={fullVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
          </div>
          <div className="flex justify-center py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={capturing}
              className="h-[72px] w-[72px] shrink-0 rounded-full border-[5px] border-white/90 bg-white/25 shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30 disabled:opacity-50"
              aria-label="Сделать фото"
            />
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
