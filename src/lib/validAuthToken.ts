/**
 * Возвращает валидный access token; при истечении срока обновляет его через refresh_token.
 * Используйте вместо getAuthTokens() перед запросами к API.
 */

import { getAuth, getAuthTokens, setAuthWithTokens, clearAuthData } from "@/lib/secureStorage";
import type { StoredAuthTokens, StoredUser } from "@/lib/secureStorage";
import { chatAuthApi, ChatAuthApiError } from "@/services/chatAuthApi";

const REFRESH_IF_EXPIRES_IN_SEC = 60;

/**
 * Сервер при refresh выдаёт новый refresh_token и инвалидирует старый.
 * Параллельные вызовы refresh с одним токеном → второй получает 401 → вылет сессии.
 * Держим один запрос refresh на процесс.
 */
let refreshInFlight: Promise<StoredAuthTokens | null> | null = null;

async function refreshSession(user: StoredUser, tokens: StoredAuthTokens): Promise<StoredAuthTokens | null> {
  try {
    const refreshed = await chatAuthApi.refresh(tokens.refresh_token);
    const newTokens: StoredAuthTokens = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
    };
    await setAuthWithTokens(user, newTokens);
    return newTokens;
  } catch (e) {
    if (e instanceof ChatAuthApiError && e.status === 401) {
      await clearAuthData();
      return null;
    }
    return tokens;
  }
}

/** Декодирует JWT payload без проверки подписи (только для чтения exp). */
function getJwtExp(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === "number" ? data.exp : null;
  } catch {
    return null;
  }
}

/**
 * Возвращает токены, при необходимости обновляя access_token через refresh.
 * При неудачном refresh очищает сессию и возвращает null.
 */
export async function getValidAuthTokens(): Promise<StoredAuthTokens | null> {
  const [user, tokens] = await Promise.all([getAuth(), getAuthTokens()]);
  if (!user || !tokens?.access_token) return null;

  const exp = getJwtExp(tokens.access_token);
  const nowSec = Math.floor(Date.now() / 1000);
  const needsRefresh =
    exp === null ||
    exp <= nowSec + REFRESH_IF_EXPIRES_IN_SEC;

  if (!needsRefresh) return tokens;

  if (!tokens.refresh_token) {
    await clearAuthData();
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshSession(user, tokens).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}
