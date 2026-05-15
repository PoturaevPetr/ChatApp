"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { chatAuthApi, ChatAuthApiError, type OAuthProviderId } from "@/services/chatAuthApi";
import { useAuthStore } from "@/stores/authStore";

const OAUTH_STATE_KEY = "oauth_state";
const OAUTH_PROVIDER_KEY = "oauth_provider";

function parseProvider(v: string | null): OAuthProviderId | null {
  if (v === "google" || v === "yandex" || v === "vk") return v;
  return null;
}

export default function OAuthCallbackPage() {
  const router = useRouter();
  const completeOAuthLogin = useAuthStore((s) => s.completeOAuthLogin);
  const clearError = useAuthStore((s) => s.clearError);
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    clearError();

    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const err = params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (err) {
      setMsg("Вход отменён или ошибка у провайдера");
      return;
    }
    if (!code || !state) {
      setMsg("Нет кода авторизации");
      return;
    }

    const saved = sessionStorage.getItem(OAUTH_STATE_KEY);
    const provRaw = sessionStorage.getItem(OAUTH_PROVIDER_KEY);
    const provider = parseProvider(provRaw);
    if (!saved || state !== saved || !provider) {
      setMsg("Сессия входа устарела. Попробуйте снова.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/oauth/callback`;

    void (async () => {
      try {
        const res = await chatAuthApi.oauthExchange({
          provider,
          code,
          redirect_uri: redirectUri,
        });
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
        await completeOAuthLogin(res);
        router.replace("/");
      } catch (e) {
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
        setMsg(
          e instanceof ChatAuthApiError
            ? e.detail || e.message
            : e instanceof Error
              ? e.message
              : "Не удалось войти"
        );
      }
    })();
  }, [router, completeOAuthLogin, clearError]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="shrink-0 p-4">
        <Link href="/auth/login/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
          К входу
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {!msg ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Завершаем вход…</p>
          </>
        ) : (
          <p className="max-w-sm text-center text-sm text-destructive">{msg}</p>
        )}
      </div>
    </div>
  );
}
