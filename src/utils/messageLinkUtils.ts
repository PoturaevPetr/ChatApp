import type { ChatMessageContent } from "@/stores/chatStore";

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export type MessageTextSegment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; display: string };

const URL_DISPLAY_MAX = 48;

/**
 * Короткая подпись для пузырька: длинный URL не показываем целиком (начало … конец).
 * Полный адрес остаётся в href и в атрибуте title ссылки.
 */
export function shortenUrlForDisplay(raw: string, maxChars = URL_DISPLAY_MAX): string {
  const s = raw.trim();
  if (s.length <= maxChars) return s;
  const inner = maxChars - 1;
  const headLen = Math.max(14, Math.floor(inner * 0.58));
  const tailLen = inner - headLen;
  if (tailLen < 6) return `${s.slice(0, inner)}…`;
  return `${s.slice(0, headLen)}…${s.slice(-tailLen)}`;
}

/**
 * Разбивает текст на фрагменты текста и валидные http(s)-ссылки.
 * Хвостовая пунктуация у URL отрезается из href, но в display остаётся безопасная строка для показа.
 */
export function parseMessageTextSegments(text: string): MessageTextSegment[] {
  if (!text) return [];
  const re = new RegExp(URL_RE.source, "gi");
  const segments: MessageTextSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: text.slice(last, m.index) });
    }
    const raw = m[0];
    const trimmed = raw.replace(/[),.;:!?\]]+$/u, "");
    if (!trimmed) {
      segments.push({ type: "text", value: raw });
      last = m.index + raw.length;
      continue;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") {
        segments.push({ type: "link", href: u.href, display: trimmed });
        last = m.index + raw.length;
        continue;
      }
    } catch {
      /* не URL */
    }
    segments.push({ type: "text", value: raw });
    last = m.index + raw.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

export function messageTextContainsHttpUrl(text: string): boolean {
  return parseMessageTextSegments(text).some((s) => s.type === "link");
}

export function getFirstOpenableHttpUrl(text: string): string | null {
  for (const s of parseMessageTextSegments(text)) {
    if (s.type === "link") return s.href;
  }
  return null;
}

export function getFirstOpenableUrlFromMessageContent(content: ChatMessageContent): string | null {
  if (content.type === "text") {
    return getFirstOpenableHttpUrl(content.text ?? "");
  }
  if (content.type === "file" && content.text?.trim()) {
    return getFirstOpenableHttpUrl(content.text);
  }
  return null;
}
