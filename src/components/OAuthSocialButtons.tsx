"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { chatAuthApi, type OAuthProviderId, type OAuthProvidersResponse } from "@/services/chatAuthApi";

const OAUTH_STATE_KEY = "oauth_state";
const OAUTH_PROVIDER_KEY = "oauth_provider";

function IconGoogle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden width={20} height={20}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function IconYandex({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden width={20} height={20}>
      <rect width="24" height="24" rx="6" fill="#FC3F1E" />
      <text
        x="12"
        y="12"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="13"
        fontWeight="700"
      >
        Я
      </text>
    </svg>
  );
}

function IconVK({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden width={20} height={20} fill="currentColor">
      <path d="M12.785 16.241s.288-.032.435-.24c.114-.18.11-.51.11-.51s-.016-1.56.7-1.79c.72-.22 1.64 1.51 2.62 2.18.74.51 1.3.4 1.3.4l2.63-.04s1.38-.08.72-1.18c-.05-.08-.36-.75-1.86-2.12-1.57-1.45-1.36-1.22.53-3.75.36-.9.5-1.5.38-1.75-.1-.24-.8-.19-.8-.19h-2.36s-1.75.12-2.3.9c-.16.25-.3.7-.3.7s-.55 1.5-.8 1.8c-.6.8-1.1.9-1.3.8-.3-.2-.2-1.1-.2-1.7 0-1.9.3-2.7-.5-2.9-.3-.1-.5-.1-1.2-.1-1 0-1.8.01-2.3.2-.3.1-.5.4-.4.4.1.1.4.1.5.3.2.3.2.8.2.8s.1 1.5-.1 1.7c-.2.1-.5-.1-1.1-1.5-.3-.7-.5-1.4-.5-1.4s-.1-.3-.3-.4c-.2-.1-.4-.1-.4-.1h-2.2s-1.5.1-1.4.8c.01.1.1.2.2.3.3.3 1.2 2.2 2.4 3.2 1.1.9 1.6 1 1.8.8.3-.2.2-1.3.2-1.3s0-.7.2-1.1c.1-.2.3-.3.4-.3.1 0 .3.2.3.2s.5.5.7 1.1c.2.6.2 1.1.2 1.1s.1.7.3.9c.2.2.4.2.4.2h1.1s1.4-.1 1.4-.1z" />
    </svg>
  );
}

function randomState(): string {
  const a = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : "";
  const b = Math.random().toString(36).slice(2, 12);
  return (a + b).slice(0, 48);
}

export function OAuthSocialButtons({ className = "" }: { className?: string }) {
  const [providers, setProviders] = useState<OAuthProvidersResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState<OAuthProviderId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void chatAuthApi
      .oauthProviders()
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Не удалось загрузить способ входа");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async (provider: OAuthProviderId) => {
    const { Capacitor } = await import("@capacitor/core");
    const { getOAuthHttpsBridgeRedirectUri } = await import("@/lib/oauthNativeRedirect");
    const isNative = Capacitor.isNativePlatform();
    const redirectUri = isNative
      ? getOAuthHttpsBridgeRedirectUri()
      : `${window.location.origin}/auth/oauth/callback`;
    const state = randomState();
    if (isNative) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: "oauth_state", value: state });
      await Preferences.set({ key: "oauth_provider", value: provider });
    } else {
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem(OAUTH_PROVIDER_KEY, provider);
    }
    setStarting(provider);
    try {
      const { authorization_url } = await chatAuthApi.getOAuthAuthorizeUrl(provider, redirectUri, state);
      if (isNative) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: authorization_url, presentationStyle: "fullscreen" });
      } else {
        window.location.href = authorization_url;
      }
    } catch {
      setLoadError("Не удалось начать вход");
      if (isNative) {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key: "oauth_state" }).catch(() => {});
        await Preferences.remove({ key: "oauth_provider" }).catch(() => {});
      }
      setStarting(null);
      return;
    }
    setStarting(null);
  }, []);

  if (loadError && !providers) {
    return <p className={`text-center text-xs text-muted-foreground ${className}`}>{loadError}</p>;
  }

  if (!providers) {
    return (
      <div className={`flex justify-center py-2 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const any = providers.google || providers.yandex || providers.vk;
  if (!any) return null;

  const iconWrap = "flex h-9 w-9 shrink-0 items-center justify-center";

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Войти через</p>

      {providers.google ? (
        <button
          type="button"
          disabled={starting !== null}
          onClick={() => void start("google")}
          className="group flex h-[48px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-[15px] font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 hover:shadow-md disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.97] dark:text-gray-900 dark:hover:bg-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:ring-black/10">
            {starting === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />
            ) : (
              <IconGoogle />
            )}
          </span>
          <span className="flex-1 text-center pr-8">Google</span>
        </button>
      ) : null}

      {providers.yandex ? (
        <button
          type="button"
          disabled={starting !== null}
          onClick={() => void start("yandex")}
          className="group flex h-[48px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-[15px] font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 hover:shadow-md disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.97] dark:text-gray-900 dark:hover:bg-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:ring-black/10">
            {starting === "yandex" ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />
            ) : (
              <IconYandex />
            )}
          </span>
          <span className="flex-1 text-center pr-8">Яндекс</span>
        </button>
      ) : null}

      {providers.vk ? (
        <button
          type="button"
          disabled={starting !== null}
          onClick={() => void start("vk")}
          className="group flex h-[48px] w-full items-center gap-3 rounded-xl border border-[#0066cc] bg-[#0077FF] px-4 text-[15px] font-semibold text-white shadow-md transition hover:bg-[#1a85ff] hover:shadow-lg disabled:opacity-60"
        >
          <span className={iconWrap}>
            {starting === "vk" ? (
              <Loader2 className="h-5 w-5 animate-spin text-white/80" aria-hidden />
            ) : (
              <IconVK className="text-white" />
            )}
          </span>
          <span className="flex-1 text-center pr-8">ВКонтакте</span>
        </button>
      ) : null}

      {loadError ? <p className="text-center text-xs text-destructive">{loadError}</p> : null}
    </div>
  );
}
