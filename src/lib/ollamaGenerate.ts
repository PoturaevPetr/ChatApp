/**
 * Клиент Ollama `/api/generate` (без stream).
 * URL: NEXT_PUBLIC_OLLAMA_BASE_URL. Модель: localStorage или NEXT_PUBLIC_OLLAMA_MODEL.
 * Ключ: NEXT_PUBLIC_OLLAMA_API_KEY → Authorization: Bearer … (или NEXT_PUBLIC_OLLAMA_API_KEY_HEADER).
 *
 * На **мобильных** в capacitor.config включён `CapacitorHttp.enabled: true` — fetch идёт через нативный
 * стек (без CORS WebView). Явный CapacitorHttp.request даёт большие таймауты для долгого generate.
 *
 * Сборка APK: ключ должен быть в окружении при `npm run build` (например `.env.local`), иначе в бандле
 * не будет NEXT_PUBLIC_OLLAMA_API_KEY → nginx вернёт 401.
 *
 * **Браузер + `npm run dev`:** `/api/ollama-proxy/...` (rewrite в next.config).
 * **Браузер + Docker:** `NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY=true` — тот же путь, прокси в nginx контейнера.
 * **Мобильное приложение:** всегда прямой `NEXT_PUBLIC_OLLAMA_BASE_URL` (CapacitorHttp), флаг прокси не используется.
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { getActiveOllamaModel } from "@/lib/ollamaModelPreference";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getOllamaBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);
  return "https://llm.oclinica.ru";
}

export function getOllamaModel(): string {
  return getActiveOllamaModel();
}

function getOllamaAuthHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_OLLAMA_API_KEY?.trim();
  if (!key) return {};

  const customHeader = process.env.NEXT_PUBLIC_OLLAMA_API_KEY_HEADER?.trim();
  if (customHeader) {
    return { [customHeader]: key };
  }

  return { Authorization: `Bearer ${key}` };
}

function mergeHeaders(base: Record<string, string>): Record<string, string> {
  return { ...getOllamaAuthHeaders(), ...base };
}

function useCapacitorOllama(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function ollamaUseSameOriginProxy(): boolean {
  return process.env.NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY === "true";
}

/** В dev и Docker-вебе — same-origin `/api/ollama-proxy`. В APK — прямой URL llm. */
function ollamaUrlForWebFetch(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV === "development" || ollamaUseSameOriginProxy())
  ) {
    return `/api/ollama-proxy${p}`;
  }
  return `${getOllamaBaseUrl()}${p}`;
}

/** Явный нативный запрос: стабильные таймауты (долгий generate). */
async function ollamaNativeRequest(
  method: string,
  path: string,
  jsonBody?: object,
): Promise<{ ok: boolean; status: number; raw: string }> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${getOllamaBaseUrl()}${p}`;
  const headers = mergeHeaders(
    jsonBody ? { "Content-Type": "application/json" } : {},
  );

  try {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: jsonBody,
      responseType: "text",
      connectTimeout: 60_000,
      readTimeout: 180_000,
    });

    const raw =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      raw,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Ollama (сеть): ${msg}. Проверьте интернет, сертификат llm, nginx и что APK собран с NEXT_PUBLIC_OLLAMA_API_KEY.`,
    );
  }
}

function assertApiKeyForNative(): void {
  if (!useCapacitorOllama()) return;
  const h = getOllamaAuthHeaders();
  if (Object.keys(h).length === 0) {
    throw new Error(
      "Ollama: в приложении нет API-ключа. Пересоберите APK с .env / NEXT_PUBLIC_OLLAMA_API_KEY при npm run build.",
    );
  }
}

export type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

export async function fetchOllamaModels(signal?: AbortSignal): Promise<string[]> {
  assertApiKeyForNative();

  let raw: string;
  let status: number;
  let ok: boolean;

  if (useCapacitorOllama()) {
    const r = await ollamaNativeRequest("GET", "/api/tags");
    raw = r.raw;
    status = r.status;
    ok = r.ok;
  } else {
    const res = await fetch(ollamaUrlForWebFetch("/api/tags"), {
      signal,
      headers: mergeHeaders({}),
    });
    raw = await res.text();
    status = res.status;
    ok = res.ok;
  }

  let data: OllamaTagsResponse = {};
  try {
    data = JSON.parse(raw) as OllamaTagsResponse;
  } catch {
    /* */
  }
  if (!ok) {
    const err =
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : raw.slice(0, 200) || `HTTP ${status}`;
    throw new Error(`Ollama HTTP ${status}: ${err}`);
  }
  const names = (data.models ?? [])
    .map((m) => (m.name ?? m.model ?? "").trim())
    .filter((n) => n.length > 0);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ru"));
}

export type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

export async function ollamaGenerate(prompt: string, signal?: AbortSignal): Promise<string> {
  assertApiKeyForNative();

  const body = {
    model: getOllamaModel(),
    prompt,
    stream: false,
  };

  let raw: string;
  let status: number;
  let ok: boolean;

  if (useCapacitorOllama()) {
    const r = await ollamaNativeRequest("POST", "/api/generate", body);
    raw = r.raw;
    status = r.status;
    ok = r.ok;
  } else {
    const res = await fetch(ollamaUrlForWebFetch("/api/generate"), {
      method: "POST",
      headers: mergeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });
    raw = await res.text();
    status = res.status;
    ok = res.ok;
  }

  let data: OllamaGenerateResponse = {};
  try {
    data = JSON.parse(raw) as OllamaGenerateResponse;
  } catch {
    /* */
  }

  if (!ok) {
    const err = data.error || raw.slice(0, 200) || `HTTP ${status}`;
    throw new Error(`Ollama HTTP ${status}: ${err}`);
  }

  const text = typeof data.response === "string" ? data.response : "";
  if (!text.trim() && data.error) {
    throw new Error(data.error);
  }
  return text;
}
