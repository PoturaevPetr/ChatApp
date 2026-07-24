/**
 * Клиент Ollama `/api/generate` (без stream).
 * URL и ключ — только с ChatService (GET /api/v1/llm/access, расшифровка на клиенте).
 * Запросы идут напрямую на LLM API (без same-origin proxy).
 * Модель: localStorage или NEXT_PUBLIC_OLLAMA_MODEL.
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { getActiveOllamaModel } from "@/lib/ollamaModelPreference";
import { getLlmCredentialsSnapshot } from "@/stores/llmAccessStore";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getOllamaModel(): string {
  return getActiveOllamaModel();
}

function getOllamaAuthHeaders(): Record<string, string> {
  const { apiKey, apiKeyHeader } = getLlmCredentialsSnapshot();
  if (!apiKey) return {};

  const customHeader = apiKeyHeader?.trim();
  if (customHeader) {
    return { [customHeader]: apiKey };
  }

  return { Authorization: `Bearer ${apiKey}` };
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

function assertLlmAccess(): { baseUrl: string } {
  const { enabled, apiKey, baseUrl } = getLlmCredentialsSnapshot();
  const url = baseUrl?.trim();
  if (!enabled || !apiKey || !url) {
    throw new Error("Нет доступа к LLM. Обратитесь к администратору чата.");
  }
  return { baseUrl: trimTrailingSlash(url) };
}

/** Прямой URL Ollama API (base_url с ChatService + path). */
function ollamaDirectUrl(path: string): string {
  const { baseUrl } = assertLlmAccess();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${p}`;
}

/** Явный нативный запрос: стабильные таймауты (долгий generate). */
async function ollamaNativeRequest(
  method: string,
  path: string,
  jsonBody?: object,
): Promise<{ ok: boolean; status: number; raw: string }> {
  const url = ollamaDirectUrl(path);
  const headers = mergeHeaders(jsonBody ? { "Content-Type": "application/json" } : {});

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

    const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      raw,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Ollama (сеть): ${msg}. Проверьте интернет и доступ LLM в настройках аккаунта.`);
  }
}

export type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

export async function fetchOllamaModels(signal?: AbortSignal): Promise<string[]> {
  assertLlmAccess();

  let raw: string;
  let status: number;
  let ok: boolean;

  if (useCapacitorOllama()) {
    const r = await ollamaNativeRequest("GET", "/api/tags");
    raw = r.raw;
    status = r.status;
    ok = r.ok;
  } else {
    const res = await fetch(ollamaDirectUrl("/api/tags"), {
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
  assertLlmAccess();

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
    const res = await fetch(ollamaDirectUrl("/api/generate"), {
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
