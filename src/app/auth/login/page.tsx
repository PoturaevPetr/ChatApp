"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, QrCode, ScanLine, Smartphone } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { DeviceLinkQrLoginModal } from "@/components/DeviceLinkQrLoginModal";
import { DeviceLinkQrScannerOverlay } from "@/components/DeviceLinkQrScannerOverlay";
import { useDeviceLinkQrCapabilities } from "@/hooks/useDeviceLinkQrCapabilities";
import { isKindredLoginPayload, parseDeviceLinkPayload } from "@/lib/deviceLinkQr";
import { AuthShell, AuthShellBody } from "@/components/auth/AuthShell";
import { AuthHero } from "@/components/auth/AuthHero";
import { AuthSection } from "@/components/auth/AuthSection";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { AuthPrimaryButton } from "@/components/auth/AuthPrimaryButton";
import { AuthBackLink, AuthTopBar } from "@/components/auth/AuthBackLink";
import { AuthActionRow } from "@/components/auth/AuthNavRow";
import { AuthOAuthSection } from "@/components/auth/AuthOAuthSection";
import { authInputClassName } from "@/components/auth/authStyles";

export default function LoginPage() {
  const router = useRouter();
  const { canScanQr, isDesktopWeb } = useDeviceLinkQrCapabilities();
  const { isAuthenticated, login, loginWithDeviceLink, isLoading, error, clearError, initialize } =
    useAuthStore();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initialize();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialize]);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/");
  }, [ready, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    try {
      await login(u, password || undefined);
      router.push("/");
    } catch {
      // error in store
    }
  };

  const openScanner = () => {
    clearError();
    setScanError(null);
    setScannerOpen(true);
  };

  const openShowQr = () => {
    clearError();
    setScanError(null);
    setQrOpen(true);
  };

  const onScannedLinkCode = useCallback(
    async (raw: string) => {
      if (isKindredLoginPayload(raw)) {
        setScanError(
          "Этот QR для входа на другом устройстве. На авторизованном устройстве: Профиль → Устройства → Подтвердить вход по QR.",
        );
        return;
      }
      const code = parseDeviceLinkPayload(raw) || raw.trim().toUpperCase();
      if (code.length < 4) return;
      clearError();
      setScanError(null);
      try {
        await loginWithDeviceLink(code);
        router.push("/");
      } catch {
        /* error in store */
      }
    },
    [clearError, loginWithDeviceLink, router],
  );

  return (
    <AuthShell loading={!ready}>
      <AuthTopBar>
        <AuthBackLink href="/auth/" />
      </AuthTopBar>

      <AuthShellBody>
        <AuthHero title="Вход" subtitle="Войдите в аккаунт" showLogo={false} />

        <AuthOAuthSection dividerLabel="или логин" />

        <AuthCard padded>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && !scannerOpen && !qrOpen ? (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
            ) : null}

            <AuthFormField
              id="username"
              label="Имя пользователя"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              required
            />

            <AuthFormField id="password" label="Пароль">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${authInputClassName} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </AuthFormField>

            <AuthPrimaryButton type="submit" disabled={!username.trim()} loading={isLoading} loadingLabel="Вход...">
              Войти
            </AuthPrimaryButton>
          </form>
        </AuthCard>

        <AuthSection title="Вход по QR">
          <AuthCard>
            {canScanQr ? (
              <AuthActionRow
                icon={ScanLine}
                label="Сканировать QR"
                subtitle="QR с авторизованного устройства (Профиль → Устройства)"
                onClick={openScanner}
                disabled={isLoading || scannerOpen || qrOpen}
              />
            ) : null}
            <AuthActionRow
              icon={isDesktopWeb ? QrCode : Smartphone}
              label="Показать QR для входа"
              subtitle={
                isDesktopWeb
                  ? "Подтвердите вход на телефоне: Профиль → Устройства → Подтвердить вход по QR"
                  : "Подтвердите вход на устройстве, где уже выполнен вход"
              }
              onClick={openShowQr}
              disabled={isLoading || scannerOpen || qrOpen}
            />
          </AuthCard>
        </AuthSection>

        {scanError ? (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{scanError}</div>
        ) : null}

        <DeviceLinkQrLoginModal open={qrOpen} onClose={() => setQrOpen(false)} />

        {canScanQr ? (
          <DeviceLinkQrScannerOverlay
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onCode={(raw) => void onScannedLinkCode(raw)}
            onError={setScanError}
            hint="Наведите на QR с авторизованного устройства"
          />
        ) : null}

        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/auth/register/" className="font-medium text-primary hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </AuthShellBody>
    </AuthShell>
  );
}
