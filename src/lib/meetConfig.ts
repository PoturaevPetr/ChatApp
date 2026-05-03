/**
 * Локальный override MeetService (только build-time env).
 * Для продакшена задайте MEET_SERVICE_PUBLIC_URL на ChatService — клиент подтянет URL через API.
 */
export function getMeetServiceUrlOverride(): string | null {
  if (typeof process === "undefined" || !process.env.NEXT_PUBLIC_MEET_SERVICE_URL) return null;
  const raw = process.env.NEXT_PUBLIC_MEET_SERVICE_URL.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}
