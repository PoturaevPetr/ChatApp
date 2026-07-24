"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys, setChatKeys, setChatKeysForUser } from "@/lib/secureStorage";
import { encryptPrivateKeyBackup, decryptPrivateKeyBackup } from "@/lib/keyBackupCrypto";
import { getKeyBackup, putKeyBackup } from "@/services/chatKeysApi";
import { useAuthStore } from "@/stores/authStore";

type Mode = "create" | "restore";

interface KeyBackupModalProps {
  open: boolean;
  onClose: () => void;
  /** create — зашифровать локальный private и PUT; restore — GET + decrypt */
  initialMode?: Mode;
}

export function KeyBackupModal({ open, onClose, initialMode = "create" }: KeyBackupModalProps) {
  const user = useAuthStore((s) => s.user);
  const clearNeedsKeyRestore = useAuthStore((s) => s.clearNeedsKeyRestore);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPassphrase("");
    setPassphrase2("");
    setError(null);
    setOk(null);
  }, [open, initialMode]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    setOk(null);
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) {
      setError("Нет сессии");
      return;
    }
    if (!passphrase || passphrase.length < 8) {
      setError("Пароль не короче 8 символов");
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
          setError("Локального ключа нет — сначала восстановите backup");
          return;
        }
        const payload = await encryptPrivateKeyBackup(keys.private_key, passphrase);
        await putKeyBackup(tokens.access_token, payload);
        setOk("Резервная копия ключа сохранена на сервере (в зашифрованном виде).");
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
        setOk("Ключ восстановлен на этом устройстве.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {mode === "create" ? "Резервная копия ключа" : "Восстановить ключ"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Пароль восстановления известен только вам. Сервер хранит только зашифрованный blob.
        </p>
        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 ${mode === "create" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            onClick={() => setMode("create")}
          >
            Создать
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 ${mode === "restore" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            onClick={() => setMode("restore")}
          >
            Восстановить
          </button>
        </div>
        <label className="mb-2 block text-sm">
          Пароль
          <input
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        {mode === "create" && (
          <label className="mb-2 block text-sm">
            Повтор
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={passphrase2}
              onChange={(e) => setPassphrase2(e.target.value)}
            />
          </label>
        )}
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {ok && <p className="mb-2 text-sm text-green-700 dark:text-green-400">{ok}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Сохранить backup" : "Восстановить"}
        </button>
      </div>
    </div>
  );
}
