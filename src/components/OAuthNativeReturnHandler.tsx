"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { chatAuthApi, type OAuthProviderId } from "@/services/chatAuthApi";
import { useAuthStore } from "@/stores/authStore";
import { getOAuthHttpsBridgeRedirectUri } from "@/lib/oauthNativeRedirect";

function parseOAuthCallback(url: string): { code?: string; state?: string; error?: string } | null {
  if (!url.includes("oauth/callback")) return null;
  try {
    const u = new URL(url);
    return {
      code: u.searchParams.get("code") ?? undefined,
      state: u.searchParams.get("state") ?? undefined,
      error: u.searchParams.get("error") ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Обрабатывает возврат из системного браузера / Custom Tabs по deep link после OAuth.
 * Должен быть смонтирован в корне приложения (рядом с NativeBootLayer).
 */
export function OAuthNativeReturnHandler() {
  const router = useRouter();
  const completeOAuthLogin = useAuthStore((s) => s.completeOAuthLogin);
  const processedCode = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const httpsBridge = getOAuthHttpsBridgeRedirectUri();

    const finish = async (url: string) => {
      const parsed = parseOAuthCallback(url);
      if (!parsed) return;
      if (parsed.error) {
        await Browser.close().catch(() => {});
        return;
      }
      const code = parsed.code;
      const state = parsed.state;
      if (!code || !state) return;
      if (processedCode.current === code) return;

      const savedState = (await Preferences.get({ key: "oauth_state" })).value;
      const providerRaw = (await Preferences.get({ key: "oauth_provider" })).value;
      const provider = providerRaw as OAuthProviderId | null;
      if (!savedState || state !== savedState || !provider) return;

      processedCode.current = code;
      try {
        await Preferences.remove({ key: "oauth_state" });
        await Preferences.remove({ key: "oauth_provider" });

        const res = await chatAuthApi.oauthExchange({
          provider,
          code,
          redirect_uri: httpsBridge,
        });
        await Browser.close().catch(() => {});
        await completeOAuthLogin(res);
        router.replace("/");
      } catch {
        processedCode.current = null;
        await Browser.close().catch(() => {});
      }
    };

    const sub = App.addListener("appUrlOpen", ({ url }) => {
      void finish(url);
    });

    void App.getLaunchUrl().then((r) => {
      if (r?.url) void finish(r.url);
    });

    return () => {
      void sub.then((s) => s.remove());
    };
  }, [router, completeOAuthLogin]);

  return null;
}
