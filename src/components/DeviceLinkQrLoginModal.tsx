"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone, X } from "lucide-react";
import { renderLinkQrDataUrl } from "@/lib/deviceLinkQr";
import { useAuthStore } from "@/stores/authStore";
import { chatAuthApi } from "@/services/chatAuthApi";
import {
  CENTER_MODAL_ANIM_MS,
  centerModalBackdropBaseClass,
  centerModalBackdropOpacityClass,
  centerModalPanelClass,
  centerModalPanelMotionClass,
  centerModalRootClass,
} from "@/lib/centerModalClasses";

const MODAL_Z = 10070;

type DeviceLinkQrLoginModalProps = {
  open: boolean;
  onClose: () => void;
};

/** QR-вход (Telegram-style): показывается в модалке по запросу, не при загрузке страницы. */
export function DeviceLinkQrLoginModal({ open, onClose }: DeviceLinkQrLoginModalProps) {
  const router = useRouter();

  const completeDeviceLinkLogin = useAuthStore((s) => s.completeDeviceLinkLogin);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const refreshRef = useRef<number | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopRefresh = useCallback(() => {
    if (refreshRef.current != null) {
      window.clearTimeout(refreshRef.current);
      refreshRef.current = null;
    }
  }, []);

  const resetQrState = useCallback(() => {
    requestIdRef.current = null;
    setQrUrl(null);
    setLoginCode(null);
    setLocalStatus(null);
    setQrError(null);
  }, []);

  const startLogin = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    stopPoll();
    stopRefresh();
    setQrError(null);
    clearError();
    try {
      const { buildDeviceRegisterBody } = await import("@/lib/buildDeviceRegisterBody");
      const body = await buildDeviceRegisterBody();
      const req = await chatAuthApi.deviceLinkRequest(body);
      requestIdRef.current = req.request_id;
      setLoginCode(req.code);
      const url = await renderLinkQrDataUrl(req.qr_payload, 220);
      setQrUrl(url);
      setLocalStatus("На авторизованном устройстве: Профиль → Устройства → Подтвердить вход по QR");

      const expiresMs = Math.max(0, new Date(req.expires_at).getTime() - Date.now());
      refreshRef.current = window.setTimeout(
        () => void startLogin(),
        Math.max(3000, expiresMs - 2000),
      );

      pollRef.current = window.setInterval(() => {
        void (async () => {
          const requestId = requestIdRef.current;
          if (!requestId) return;
          try {
            const poll = await chatAuthApi.deviceLinkPoll(requestId);
            if (
              poll.status === "approved" &&
              poll.access_token &&
              poll.refresh_token &&
              poll.user_id &&
              poll.username
            ) {
              stopPoll();
              stopRefresh();
              setLocalStatus("Вход подтверждён…");
              await completeDeviceLinkLogin({
                access_token: poll.access_token,
                refresh_token: poll.refresh_token,
                user_id: poll.user_id,
                username: poll.username,
              });
              router.push("/");
            } else if (poll.status === "expired") {
              stopPoll();
              void startLogin();
            }
          } catch {
            /* keep polling */
          }
        })();
      }, 2000);
    } catch (e) {
      setLocalStatus(null);
      setQrError(e instanceof Error ? e.message : "Не удалось создать QR для входа");
    } finally {
      startingRef.current = false;
    }
  }, [clearError, completeDeviceLinkLogin, router, stopPoll, stopRefresh]);

  useEffect(() => {
    if (open) {
      setIsExiting(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setIsVisible(false);
    setIsExiting(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      stopPoll();
      stopRefresh();
      resetQrState();
      return;
    }
    void startLogin();
    return () => {
      stopPoll();
      stopRefresh();
    };
  }, [open, resetQrState, startLogin, stopPoll, stopRefresh]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, CENTER_MODAL_ANIM_MS);
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={centerModalRootClass}
      style={{ zIndex: MODAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-link-qr-title"
    >
      <div
        className={`${centerModalBackdropBaseClass} ${centerModalBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={handleClose}
        aria-hidden
      />
      <div
        className={`${centerModalPanelClass} max-w-sm ${centerModalPanelMotionClass(isVisible, isExiting)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="device-link-qr-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Smartphone size={20} aria-hidden />
              Вход по QR
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Подтвердите на устройстве, где вы уже вошли
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt="QR для входа"
              className="mx-auto h-[200px] w-[200px] rounded-lg bg-white p-2"
            />
          ) : (
            <div className="mx-auto flex h-[200px] w-[200px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {loginCode ? (
            <p className="mt-2 font-mono text-lg tracking-widest text-foreground">{loginCode}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Профиль → Устройства → Подтвердить вход по QR
          </p>
          {qrError ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-primary hover:underline"
              onClick={() => void startLogin()}
            >
              Повторить
            </button>
          ) : null}
          {qrError ? <p className="mt-2 text-sm text-destructive">{qrError}</p> : null}
        </div>

        {localStatus ? <p className="mt-3 text-center text-sm text-foreground/80">{localStatus}</p> : null}
        {isLoading ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Вход…
          </p>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
