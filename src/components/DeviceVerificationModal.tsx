"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, QrCode, ShieldAlert, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { renderLinkQrDataUrl } from "@/lib/deviceLinkQr";
import { chatAuthApi } from "@/services/chatAuthApi";
import { getKeyBackup } from "@/services/chatKeysApi";
import { decryptPrivateKeyBackup } from "@/lib/keyBackupCrypto";
import { getOrCreateLocalDeviceIdentity } from "@/lib/deviceIdentity";
import { setChatKeys, setChatKeysForUser } from "@/lib/secureStorage";

const MODAL_Z = 10080;

export function DeviceVerificationModal() {
  const { user, needsKeyRestore, clearNeedsKeyRestore } = useAuthStore();
  const reloadChats = useChatStore((s) => s.loadChats);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"qr" | "passphrase">("qr");

  // QR state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const refreshRef = useRef<number | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // Passphrase state
  const [passphrase, setPassphrase] = useState("");
  const [passphraseBusy, setPassphraseBusy] = useState(false);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [passphraseSuccess, setPassphraseSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (needsKeyRestore) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [needsKeyRestore]);

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

  const startQrFlow = useCallback(async () => {
    stopPoll();
    stopRefresh();
    setQrError(null);
    setQrLoading(true);

    try {
      const { buildDeviceRegisterBody } = await import("@/lib/buildDeviceRegisterBody");
      const body = await buildDeviceRegisterBody();
      const req = await chatAuthApi.deviceLinkRequest(body);
      requestIdRef.current = req.request_id;
      setLoginCode(req.code);
      const url = await renderLinkQrDataUrl(req.qr_payload, 240);
      setQrUrl(url);

      const expiresMs = Math.max(0, new Date(req.expires_at).getTime() - Date.now());
      refreshRef.current = window.setTimeout(
        () => void startQrFlow(),
        Math.max(3000, expiresMs - 2000),
      );

      pollRef.current = window.setInterval(() => {
        void (async () => {
          const rId = requestIdRef.current;
          if (!rId) return;
          try {
            const poll = await chatAuthApi.deviceLinkPoll(rId);
            if (poll.status === "approved") {
              stopPoll();
              stopRefresh();
              // После подтверждения связки токены обновлены, ключи устройства зарегистрированы
              clearNeedsKeyRestore();
              setOpen(false);
              if (user?.id) void reloadChats(user.id);
            } else if (poll.status === "expired") {
              stopPoll();
              void startQrFlow();
            }
          } catch {
            /* ignore network errors during poll */
          }
        })();
      }, 2000);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Не удалось создать QR-код");
    } finally {
      setQrLoading(false);
    }
  }, [clearNeedsKeyRestore, reloadChats, stopPoll, stopRefresh]);

  useEffect(() => {
    if (open && tab === "qr") {
      void startQrFlow();
    } else {
      stopPoll();
      stopRefresh();
    }
    return () => {
      stopPoll();
      stopRefresh();
    };
  }, [open, tab, startQrFlow, stopPoll, stopRefresh]);

  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassphraseError(null);
    setPassphraseSuccess(null);

    if (!passphrase || passphrase.length < 6) {
      setPassphraseError("Введите пароль (не менее 6 символов)");
      return;
    }

    setPassphraseBusy(true);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) {
        throw new Error("Сессия не найдена. Попробуйте войти заново.");
      }

      const remote = await getKeyBackup(tokens.access_token);
      const restoredPem = await decryptPrivateKeyBackup(
        {
          ciphertext: remote.ciphertext,
          kdf: "pbkdf2-sha256",
          kdf_salt_b64: remote.kdf_salt_b64,
          kdf_params: { iterations: Number(remote.kdf_params?.iterations) || 310000 },
          wrap_alg: "aes-256-gcm",
          nonce_b64: remote.nonce_b64,
        },
        passphrase,
      );

      const localIdent = await getOrCreateLocalDeviceIdentity();
      const restoredKeys = {
        public_key: localIdent.publicKeyPem,
        private_key: restoredPem,
      };

      await setChatKeys(restoredKeys);
      if (user?.id) {
        await setChatKeysForUser(user.id, restoredKeys);
      }

      setPassphraseSuccess("Ключ успешно расшифрован!");
      clearNeedsKeyRestore();

      setTimeout(() => {
        setOpen(false);
        if (user?.id) void reloadChats(user.id);
      }, 500);
    } catch (err) {
      setPassphraseError(
        err instanceof Error && err.message.includes("operation failed")
          ? "Неверный пароль восстановления. Попробуйте еще раз."
          : (err instanceof Error ? err.message : "Не удалось расшифровать ключ"),
      );
    } finally {
      setPassphraseBusy(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md transition-all"
      style={{ zIndex: MODAL_Z }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <ShieldAlert size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Подтверждение входа</h2>
              <p className="text-xs text-muted-foreground">Требуется для чтения сообщений (E2E)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Пропустить"
          >
            <X size={18} />
          </button>
        </div>

        {/* Переключатель вкладок: QR / Пароль */}
        <div className="flex rounded-xl bg-muted/50 p-1 mt-4">
          <button
            type="button"
            onClick={() => setTab("qr")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all ${
              tab === "qr"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode size={16} />
            Через QR-код
          </button>
          <button
            type="button"
            onClick={() => setTab("passphrase")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all ${
              tab === "passphrase"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <KeyRound size={16} />
            Пароль восстановления
          </button>
        </div>

        {tab === "qr" ? (
          <div className="flex flex-col items-center justify-center pt-5 text-center">
            <div className="flex h-[240px] w-[240px] items-center justify-center rounded-2xl border border-border bg-white p-3 shadow-inner">
              {qrLoading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs">Генерация QR…</span>
                </div>
              ) : qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl}
                  alt="QR-код для подтверждения"
                  className="h-full w-full object-contain"
                />
              ) : (
                <p className="text-xs text-destructive">{qrError || "Не удалось загрузить QR"}</p>
              )}
            </div>

            {loginCode ? (
              <div className="mt-3 font-mono text-xl tracking-[0.2em] font-semibold text-foreground">
                {loginCode}
              </div>
            ) : null}

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground max-w-xs">
              Откройте Kindred на вашем основном телефоне или компьютере:  
              <br />
              <strong className="text-foreground">Профиль → Устройства → Подтвердить вход</strong>
            </p>

            <button
              type="button"
              onClick={() => setTab("passphrase")}
              className="mt-4 text-xs font-medium text-primary hover:underline"
            >
              Нет доступа к другому устройству?
            </button>
          </div>
        ) : (
          <form onSubmit={handlePassphraseSubmit} className="flex flex-col pt-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Если у вас нет под рукой другого устройства, введите пароль от аккаунта или кодовую фразу восстановления, которую вы создали ранее:
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Пароль восстановления
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Введите пароль"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            {passphraseError ? (
              <p className="mt-2 text-xs text-destructive leading-snug">{passphraseError}</p>
            ) : null}

            {passphraseSuccess ? (
              <p className="mt-2 text-xs text-emerald-500 font-medium leading-snug">{passphraseSuccess}</p>
            ) : null}

            <button
              type="submit"
              disabled={passphraseBusy || !passphrase}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {passphraseBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Расшифровка…
                </>
              ) : (
                "Подтвердить и открыть сообщения"
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab("qr")}
              className="mt-3 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Вернуться к QR-коду
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
