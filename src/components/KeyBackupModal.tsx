"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys, setChatKeys, setChatKeysForUser } from "@/lib/secureStorage";
import { encryptPrivateKeyBackup, decryptPrivateKeyBackup } from "@/lib/keyBackupCrypto";
import { getKeyBackup, putKeyBackup } from "@/services/chatKeysApi";
import { useAuthStore } from "@/stores/authStore";

type Mode = "create" | "restore";

interface KeyBackupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** create — зашифровать локальный private и PUT; restore — GET + decrypt */
  initialMode?: Mode;
}

export function KeyBackupModal({
  open,
  onClose,
  onSuccess,
  initialMode = "create",
}: KeyBackupModalProps) {
  const user = useAuthStore((s) => s.user);
  const clearNeedsKeyRestore = useAuthStore((s) => s.clearNeedsKeyRestore);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showPassphrase2, setShowPassphrase2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [serverHasBackup, setServerHasBackup] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPassphrase("");
    setPassphrase2("");
    setShowPassphrase(false);
    setShowPassphrase2(false);
    setError(null);
    setOk(null);

    let cancelled = false;
    void (async () => {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      try {
        await getKeyBackup(tokens.access_token);
        if (!cancelled) setServerHasBackup(true);
      } catch {
        if (!cancelled) setServerHasBackup(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialMode]);

  if (!open) return null;

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setOk(null);
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) {
      setError("Сессия не найдена. Попробуйте войти заново.");
      return;
    }
    if (!passphrase || passphrase.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        if (passphrase !== passphrase2) {
          setError("Пароли не совпадают");
          return;
        }
        const keys = await getChatKeys();
        if (!keys?.private_key) {
          setError("Локальный ключ отсутствует на этом устройстве. Сначала восстановите его.");
          return;
        }
        const payload = await encryptPrivateKeyBackup(keys.private_key, passphrase);
        await putKeyBackup(tokens.access_token, payload);
        setOk("Облачный пароль успешно сохранен! Резервная копия ключа обновлена.");
        setServerHasBackup(true);
        onSuccess?.();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        const remote = await getKeyBackup(tokens.access_token);
        const pem = await decryptPrivateKeyBackup(
          {
            ciphertext: remote.ciphertext,
            kdf: "pbkdf2-sha256",
            kdf_salt_b64: remote.kdf_salt_b64,
            kdf_params: { iterations: Number(remote.kdf_params?.iterations) || 310000 },
            wrap_alg: "aes-256-gcm",
            nonce_b64: remote.nonce_b64,
          },
          passphrase
        );
        let publicPem = (await getChatKeys())?.public_key || "";
        if (!publicPem) {
          try {
            const { getOrCreateLocalDeviceIdentity } = await import("@/lib/deviceIdentity");
            publicPem = (await getOrCreateLocalDeviceIdentity()).publicKeyPem;
          } catch {
            /* ignore */
          }
        }
        if (!publicPem) {
          setError("Не найден локальный публичный ключ устройства");
          return;
        }
        const keys = { public_key: publicPem, private_key: pem };
        await setChatKeys(keys);
        if (user?.id) await setChatKeysForUser(user.id, keys);
        clearNeedsKeyRestore();
        setOk("Ключ успешно расшифрован и сохранен на этом устройстве!");
        onSuccess?.();
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Произошла ошибка";
      if (msg.includes("operation failed") || msg.includes("decrypt")) {
        setError("Неверный облачный пароль. Проверьте правильность ввода.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {mode === "create" ? "Облачный пароль" : "Восстановление ключа"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mode === "create"
                  ? "Настройка резервной копии E2E"
                  : "Расшифровка ключей сообщений"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
          <p>
            Облачный пароль шифрует ваши ключи локально в браузере. Сервер никогда не получает ваш
            пароль или незашифрованную переписку.
          </p>
        </div>

        {serverHasBackup !== null && mode === "create" && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-xs border border-border/50">
            <span className="text-muted-foreground">Текущий статус:</span>
            <span
              className={`font-medium ${
                serverHasBackup
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {serverHasBackup ? "Активен на сервере" : "Не настроен"}
            </span>
          </div>
        )}

        <div className="mb-4 flex rounded-xl bg-muted/50 p-1 text-xs">
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 font-medium transition-all ${
              mode === "create"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setMode("create");
              setError(null);
              setOk(null);
            }}
          >
            {serverHasBackup ? "Сменить пароль" : "Задать пароль"}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 font-medium transition-all ${
              mode === "restore"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setMode("restore");
              setError(null);
              setOk(null);
            }}
          >
            Восстановить из облака
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {mode === "create" ? "Новый облачный пароль" : "Облачный пароль"}
            </label>
            <div className="relative">
              <input
                type={showPassphrase ? "text" : "password"}
                autoComplete="new-password"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Минимум 6 символов"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                aria-label={showPassphrase ? "Скрыть" : "Показать"}
              >
                {showPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === "create" && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Повторите пароль
              </label>
              <div className="relative">
                <input
                  type={showPassphrase2 ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                  value={passphrase2}
                  onChange={(e) => setPassphrase2(e.target.value)}
                  placeholder="Повторите пароль"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase2((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassphrase2 ? "Скрыть" : "Показать"}
                >
                  {showPassphrase2 ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {error ? <p className="text-xs text-destructive leading-snug">{error}</p> : null}
          {ok ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium leading-snug">
              {ok}
            </p>
          ) : null}

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy || !passphrase}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Обработка...
                </>
              ) : mode === "create" ? (
                "Сохранить облачный пароль"
              ) : (
                "Восстановить ключи"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
