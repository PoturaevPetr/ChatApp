/**
 * Клиент Ollama `/api/generate` (без stream).
 * URL и модель: NEXT_PUBLIC_OLLAMA_BASE_URL, NEXT_PUBLIC_OLLAMA_MODEL (для прода — свой домен).
 */

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getOllamaBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);
  return "https://llm.oclinica.ru";
}

export function getOllamaModel(): string {
  return process.env.NEXT_PUBLIC_OLLAMA_MODEL?.trim() || "gemma3:4b";
}

export type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

export async function ollamaGenerate(prompt: string, signal?: AbortSignal): Promise<string> {
  const base = getOllamaBaseUrl();
  const url = `${base}/api/generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getOllamaModel(),
      prompt,
      stream: false,
    }),
    signal,
  });

  const raw = await res.text();
  let data: OllamaGenerateResponse = {};
  try {
    data = JSON.parse(raw) as OllamaGenerateResponse;
  } catch {
    /* */
  }

  if (!res.ok) {
    const err = data.error || raw.slice(0, 200) || res.statusText;
    throw new Error(`Ollama HTTP ${res.status}: ${err}`);
  }

  const text = typeof data.response === "string" ? data.response : "";
  if (!text.trim() && data.error) {
    throw new Error(data.error);
  }
  return text;
}
