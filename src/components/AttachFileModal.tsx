"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { FileUp, ImagePlus, Loader2, MapPin, SwitchCamera, Upload, X } from "lucide-react";
import type { MediaAsset } from "@capacitor-community/media";
import {
  fetchRecentGalleryMedias,
  mediaAssetToSendableFile,
  mediaThumbSrc,
  openAppPhotoSettings,
  pickImageFromSystemGallery,
  requestPhotoLibraryAccess,
} from "@/lib/galleryMedia";

interface AttachFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Системный захват камеры (fallback, если нет превью). */
  onTakePhoto: () => void;
  onUploadFile: () => void;
  onImageFile: (file: File) => void;
  /**
   * Если задан — показывается отдельный блок «Изображение» (выбор только картинок, как аватар группы).
   * Блок «Файл» открывает onUploadFile (любые типы).
   */
  onChooseImageFromDevice?: () => void;
  /** Отправка геопозиции (отдельная модалка с картой на экране чата). */
  onShareLocation?: () => void;
  /** Заголовок модалки (по умолчанию — общий текст вложения). */
  modalTitle?: string;
  modalSubtitle?: string;
}

const ANIMATION_MS = 300;
/** Сколько недавних фото запросить при открытии модалки. */
const GALLERY_INITIAL = 29;
/** На сколько увеличивать quantity при подгрузке по скроллу. */
const GALLERY_PAGE = 30;

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

type CameraFacing = "environment" | "user";

async function acquireVideoStream(facing: CameraFacing): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
  }
}

export function AttachFileModal({
  isOpen,
  onClose,
  onTakePhoto,
  onUploadFile,
  onImageFile,
  onChooseImageFromDevice,
  onShareLocation,
  modalTitle,
  modalSubtitle,
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
  const [activeFacing, setActiveFacing] = useState<CameraFacing>("environment");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [fullscreenCamera, setFullscreenCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [galleryPermissionDenied, setGalleryPermissionDenied] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const isIosNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  /** iOS (getMedias) и Android (скан альбомов + readdir). */
  const supportsNativeGallery = isIosNative || isAndroidNative;

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
    setGalleryPermissionDenied(false);

    if (!supportsNativeGallery) {
      setGalleryLoading(false);
      return;
    }

    setGalleryLoading(true);
    const qty = GALLERY_INITIAL;
    void (async () => {
      const { allowed } = await requestPhotoLibraryAccess();
      if (cancelled) return;
      if (!allowed) {
        setGalleryPermissionDenied(true);
        setGalleryLoading(false);
        return;
      }
      const result = await fetchRecentGalleryMedias(qty);
      if (cancelled) return;
      if (result.permissionDenied) setGalleryPermissionDenied(true);
      setGallery(result.medias);
      setLastGalleryQuantity(qty);
      setGalleryHasMore(result.medias.length === qty);
      setGalleryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, supportsNativeGallery]);

  const loadMoreGallery = useCallback(() => {
    if (
      !supportsNativeGallery ||
      galleryLoading ||
      galleryLoadingMore ||
      !galleryHasMore ||
      galleryLoadMoreBusyRef.current
    ) {
      return;
    }
    const nextQty = lastGalleryQuantity + GALLERY_PAGE;
    galleryLoadMoreBusyRef.current = true;
    setGalleryLoadingMore(true);
    void fetchRecentGalleryMedias(nextQty)
      .then((result) => {
        if (result.permissionDenied) setGalleryPermissionDenied(true);
        setGallery(result.medias);
        setLastGalleryQuantity(nextQty);
        setGalleryHasMore(result.medias.length === nextQty);
      })
      .catch(() => {
        setGalleryHasMore(false);
      })
      .finally(() => {
        setGalleryLoadingMore(false);
        galleryLoadMoreBusyRef.current = false;
      });
  }, [galleryLoading, galleryLoadingMore, galleryHasMore, supportsNativeGallery, lastGalleryQuantity]);

  /** Подгрузка недавних фото при прокрутке ряда (горизонтально). */
  const onGalleryRowScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const nearEndX = el.scrollWidth - el.scrollLeft - el.clientWidth < 120;
      if (nearEndX) loadMoreGallery();
    },
    [loadMoreGallery],
  );

  useEffect(() => {
    if (!isOpen || !isVisible || isExiting) return;
    let alive = true;
    let obtained: MediaStream | null = null;
    (async () => {
      try {
        obtained = await acquireVideoStream("environment");
        if (!alive) {
          stopStream(obtained);
          return;
        }
        setActiveFacing("environment");
        setCameraStream(obtained);
        setCameraDenied(false);
      } catch {
        try {
          obtained = await acquireVideoStream("user");
          if (!alive) {
            stopStream(obtained);
            return;
          }
          setActiveFacing("user");
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

  const handleSwitchCamera = useCallback(async () => {
    if (!fullscreenCamera || switchingCamera) return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    const previousFacing = activeFacing;
    const nextFacing: CameraFacing = previousFacing === "environment" ? "user" : "environment";

    setSwitchingCamera(true);
    stopStream(streamRef.current);

    try {
      const stream = await acquireVideoStream(nextFacing);
      setCameraStream(stream);
      setActiveFacing(nextFacing);
      setCameraDenied(false);
    } catch {
      try {
        const stream = await acquireVideoStream(previousFacing);
        setCameraStream(stream);
        setCameraDenied(false);
      } catch {
        setCameraDenied(true);
      }
    } finally {
      setSwitchingCamera(false);
    }
  }, [fullscreenCamera, switchingCamera, activeFacing]);

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

  const ANDROID_GALLERY_PICK_ID = "__android_gallery__";

  const handleAndroidGalleryPick = async () => {
    if (!canAct || pickingId) return;
    setPickingId(ANDROID_GALLERY_PICK_ID);
    try {
      const file = await pickImageFromSystemGallery();
      if (file) finishAndClose(() => onImageFile(file));
    } catch (e) {
      console.warn("[AttachFileModal] Android gallery:", e);
    } finally {
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
          {modalTitle ?? "Прикрепить"}
        </h2>
        {modalSubtitle != null && modalSubtitle !== "" ? (
          <p className="mt-0.5 px-4 text-center text-xs text-muted-foreground">{modalSubtitle}</p>
        ) : null}

        <div className="mt-2 px-3">
          {/* Один ряд: камера | фото | файл — одинаковые квадраты (или камера | диск). Галерея — ниже на всю ширину. */}
          <div
            className={`grid w-full gap-2 pb-2 pt-0.5 ${
              onChooseImageFromDevice
                ? "grid-cols-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                : "grid-cols-2 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]"
            }`}
          >
            <div className="min-w-0 flex items-center justify-center">
              <button
                type="button"
                onClick={openPreviewTap}
                className="relative aspect-square w-full max-w-[min(100%,9.5rem)] overflow-hidden rounded-xl bg-black focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label={cameraDenied ? "Открыть камеру" : "Снимок на весь экран"}
              >
                {cameraStream && !cameraDenied ? (
                  <video ref={previewVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-muted/40 p-0.5 text-[8px] leading-tight text-muted-foreground">
                    <ImagePlus className="h-5 w-5 shrink-0 opacity-60" />
                    <span className="px-0.5 text-center">Камера</span>
                  </div>
                )}
              </button>
            </div>

            {onChooseImageFromDevice ? (
              <>
                <div className="min-w-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isVisible || !canAct) return;
                      finishAndClose(() => onChooseImageFromDevice());
                    }}
                    className="relative flex aspect-square w-full max-w-[min(100%,9.5rem)] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-border bg-muted/20 px-1 py-1 text-[10px] font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/35 active:scale-[0.98]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    Фото
                  </button>
                </div>
                <div className="min-w-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isVisible || !canAct) return;
                      finishAndClose(() => onUploadFile());
                    }}
                    className="relative flex aspect-square w-full max-w-[min(100%,9.5rem)] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-border bg-muted/20 px-1 py-1 text-[10px] font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/35 active:scale-[0.98]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                      <FileUp className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    Файл
                  </button>
                </div>
              </>
            ) : (
              <div className="min-w-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isVisible || !canAct) return;
                    finishAndClose(() => onUploadFile());
                  }}
                  className="relative flex aspect-square w-full max-w-[min(100%,9.5rem)] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-border bg-muted/25 px-2 py-2 text-[10px] font-medium text-foreground hover:bg-muted/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  Диск
                </button>
              </div>
            )}
          </div>

          {onShareLocation ? (
            <div className="flex w-full justify-start pb-2 pt-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isVisible || !canAct) return;
                  finishAndClose(() => onShareLocation());
                }}
                className="relative flex aspect-square w-1/3 max-w-[33%] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-border bg-muted/20 px-1 py-1 text-[10px] font-medium text-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/35 active:scale-[0.98]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </span>
                Геопозиция
              </button>
            </div>
          ) : null}

          {supportsNativeGallery ? (
            <div className="pb-2">
              <div
                className="flex max-h-[min(9.5rem,32vw)] min-h-[3.25rem] w-full gap-1 overflow-x-auto overflow-y-hidden scroll-smooth overscroll-x-contain [-webkit-overflow-scrolling:touch] py-0.5"
                onScroll={onGalleryRowScroll}
              >
                {galleryLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={`sk-${i}`}
                        className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-muted/50"
                        aria-hidden
                      />
                    ))
                  : null}

                {!galleryLoading && isAndroidNative && !galleryPermissionDenied && gallery.length === 0 ? (
                  <button
                    type="button"
                    disabled={pickingId !== null}
                    onClick={() => void handleAndroidGalleryPick()}
                    className="relative flex h-14 min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-border/60 bg-muted/25 px-1 text-center focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:opacity-50"
                    aria-label="Выбрать фото из галереи"
                  >
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-[9px] font-medium leading-tight text-foreground">Галерея</span>
                    {pickingId === ANDROID_GALLERY_PICK_ID ? (
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </span>
                    ) : null}
                  </button>
                ) : null}

                {!galleryLoading && gallery.length > 0
                  ? gallery.map((asset, index) => {
                      const src = mediaThumbSrc(asset);
                      return (
                        <button
                          key={asset.identifier}
                          type="button"
                          disabled={pickingId !== null}
                          onClick={() => void handleGalleryPick(asset, index)}
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:opacity-50"
                          aria-label="Выбрать фото"
                        >
                          {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-muted/40">
                              <ImagePlus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          {pickingId === asset.identifier ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  : null}
              </div>
            </div>
          ) : null}

          {galleryLoadingMore ? (
            <div className="flex justify-center py-1.5" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : null}

          {supportsNativeGallery && galleryPermissionDenied ? (
            <div className="mt-2 space-y-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-center">
              <p className="text-xs text-foreground">Нужен доступ к фото — включите в настройках.</p>
              <button
                type="button"
                onClick={() => void openAppPhotoSettings()}
                className="w-full rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                Настройки
              </button>
            </div>
          ) : null}

          {supportsNativeGallery && !galleryLoading && !galleryPermissionDenied && gallery.length === 0 ? (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {onChooseImageFromDevice
                ? "Нет превью — ряд ниже или «Фото»."
                : "Нет превью — ряд ниже или «Диск»."}
            </p>
          ) : null}

          {!Capacitor.isNativePlatform() && !galleryLoading ? (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              {onChooseImageFromDevice ? "«Фото» или «Файл»" : "«Диск» "}
            </p>
          ) : null}
        </div>
      </div>

      {fullscreenCamera ? (
        <div
          className="fixed inset-0 z-[10060] flex flex-col bg-black"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            <span className="min-w-0 truncate text-sm font-medium text-white/90">Снимок</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                disabled={switchingCamera || !cameraStream}
                className="rounded-full p-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Переключить камеру"
                title="Переключить камеру"
              >
                {switchingCamera ? (
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                ) : (
                  <SwitchCamera className="h-6 w-6" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={closeFullscreen}
                className="rounded-full p-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
                aria-label="Закрыть"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
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
