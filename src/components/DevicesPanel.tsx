"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, Link2, QrCode, ScanLine, Smartphone, Trash2 } from "lucide-react";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getOrCreateLocalDeviceId } from "@/lib/deviceIdentity";
import { isKindredLinkPayload, parseDeviceLinkPayload, renderLinkQrDataUrl } from "@/lib/deviceLinkQr";
import {
  formatStoredDevicePlatformLabel,
  isStoredMobileDevice,
} from "@/lib/clientDevicePlatform";
import { useDeviceLinkQrCapabilities } from "@/hooks/useDeviceLinkQrCapabilities";
import { DeviceLinkQrScannerOverlay } from "@/components/DeviceLinkQrScannerOverlay";
import { DeviceLinkQrOfferOverlay } from "@/components/DeviceLinkQrOfferOverlay";
import {
  approveDeviceLogin,
  listMyDevices,
  revokeDevice,
  startDeviceLink,
  type DeviceInfo,
  type LinkStartResponse,
} from "@/services/chatDevicesApi";

function LinkQrBlock({
  linkOffer,
  qrDataUrl,
}: {
  linkOffer: LinkStartResponse;
  qrDataUrl: string | null;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl}
          alt="QR для входа на новом устройстве"
          className="mx-auto h-[200px] w-[200px] rounded-md bg-white p-2"
        />
      ) : (
        <div className="mx-auto flex h-[200px] w-[200px] items-center justify-center text-xs text-muted-foreground">
          Генерация QR…
        </div>
      )}
      <div className="mt-2 font-mono text-xl tracking-widest">{linkOffer.code}</div>
      <p className="mt-1 text-xs text-muted-foreground">На новом устройстве: вход → Сканировать QR</p>
    </div>
  );
}

export function DevicesPanel({
  className = "",
  embedded = false,
}: {
  className?: string;
  embedded?: boolean;
}) {
  const { canScanQr, isDesktopWeb, preferInlineLinkQr } = useDeviceLinkQrCapabilities();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [localId, setLocalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [linkOffer, setLinkOffer] = useState<LinkStartResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkScannerOpen, setLinkScannerOpen] = useState(false);
  const [linkOfferOpen, setLinkOfferOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    const [list, id] = await Promise.all([
      listMyDevices(tokens.access_token),
      getOrCreateLocalDeviceId(),
    ]);
    setDevices(list);
    setLocalId(id);
  }, []);

  useEffect(() => {
    void reload().catch(() => setError("Не удалось загрузить устройства"));
  }, [reload]);

  useEffect(() => {
    if (!linkOffer?.qr_payload) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void renderLinkQrDataUrl(linkOffer.qr_payload)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkOffer?.qr_payload]);

  const onStartLink = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) throw new Error("Нет авторизации");
      const offer = await startDeviceLink(tokens.access_token);
      setLinkOffer(offer);
      if (!preferInlineLinkQr) {
        setLinkOfferOpen(true);
      }
      setStatus("Покажите QR на новом устройстве: вход → Сканировать QR");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания кода");
    } finally {
      setBusy(false);
    }
  };

  const onApproveLoginCode = useCallback(
    async (raw: string) => {
      if (isKindredLinkPayload(raw)) {
        setLinkError(
          "Этот QR для нового устройства. На нём откройте вход → Сканировать QR и наведите камеру сюда.",
        );
        return;
      }
      const code = parseDeviceLinkPayload(raw) || raw.trim().toUpperCase();
      if (code.length < 4) return;
      setBusy(true);
      setLinkError(null);
      setStatus(null);
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) throw new Error("Нет авторизации");
        await approveDeviceLogin(tokens.access_token, code);
        await reload();
        setStatus("Вход на другом устройстве подтверждён");
      } catch (e) {
        setLinkError(e instanceof Error ? e.message : "Не удалось подтвердить вход");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const onRevoke = async (deviceId: string) => {
    if (deviceId === localId) {
      setError("Нельзя отозвать текущее устройство здесь");
      return;
    }
    if (!window.confirm("Отозвать устройство? Оно перестанет получать сообщения.")) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) throw new Error("Нет авторизации");
      await revokeDevice(tokens.access_token, deviceId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка отзыва");
    } finally {
      setBusy(false);
    }
  };

  const rootClass = embedded
    ? `text-sm ${className}`
    : `rounded-xl border border-border bg-muted/20 p-4 text-sm ${className}`;

  return (
    <div className={rootClass}>
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Link2 size={18} aria-hidden />
        Устройства
      </div>
      <p className="mt-1 text-muted-foreground">
        {isDesktopWeb
          ? "Покажите QR новому устройству. Подтверждение входа — с телефона, где вы уже вошли."
          : "Покажите QR новому устройству или подтвердите вход на другом устройстве."}
      </p>

      {error ? <p className="mt-2 text-destructive">{error}</p> : null}
      {status ? <p className="mt-2 text-foreground/80">{status}</p> : null}

      <ul className="mt-3 space-y-2">
        {devices.map((d) => {
          const Icon = isStoredMobileDevice(d.platform, d.name) ? Smartphone : Laptop;
          const platformLabel = formatStoredDevicePlatformLabel(d.platform, d.name);
          const isLocal = d.device_id === localId;
          return (
            <li
              key={d.device_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon size={16} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {d.name || platformLabel || "Устройство"}
                    {isLocal ? " · это устройство" : ""}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {platformLabel}
                    {d.linked_at ? " · привязано" : " · ожидает линк"}
                    {typeof d.unused_otpk_count === "number" ? ` · OTP ${d.unused_otpk_count}` : ""}
                  </div>
                </div>
              </div>
              {!isLocal ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRevoke(d.device_id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label="Отозвать"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Новое устройство</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onStartLink()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 font-medium hover:bg-muted/40 disabled:opacity-50"
          >
            <QrCode size={18} aria-hidden />
            Показать QR для нового устройства
          </button>
          {linkOffer && preferInlineLinkQr ? <LinkQrBlock linkOffer={linkOffer} qrDataUrl={qrDataUrl} /> : null}
          {linkOffer && !preferInlineLinkQr ? (
            <button
              type="button"
              onClick={() => setLinkOfferOpen(true)}
              className="w-full text-center text-xs font-medium text-primary hover:underline"
            >
              Открыть QR снова
            </button>
          ) : null}
        </div>

        {canScanQr ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Вход на другом устройстве
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setLinkError(null);
                setLinkScannerOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 font-medium hover:bg-muted/40 disabled:opacity-50"
            >
              <ScanLine size={18} aria-hidden />
              Подтвердить вход по QR
            </button>
            <p className="text-xs text-muted-foreground">
              Сканируйте QR с устройства, где открыт вход → Показать QR для входа
            </p>
          </div>
        ) : null}

        {linkError ? <p className="text-destructive">{linkError}</p> : null}
      </div>

      {canScanQr ? (
        <DeviceLinkQrScannerOverlay
          open={linkScannerOpen}
          onClose={() => setLinkScannerOpen(false)}
          onCode={(raw) => void onApproveLoginCode(raw)}
          onError={setLinkError}
          hint="Наведите на QR с экрана входа на другом устройстве"
        />
      ) : null}

      <DeviceLinkQrOfferOverlay
        open={linkOfferOpen && !preferInlineLinkQr && !!linkOffer}
        onClose={() => setLinkOfferOpen(false)}
        qrDataUrl={qrDataUrl}
        code={linkOffer?.code ?? null}
      />
    </div>
  );
}
