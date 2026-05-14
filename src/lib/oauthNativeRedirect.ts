/**
 * HTTPS-редирект для нативного OAuth: этот URL указывается в Google / Яндекс.
 * ChatService отдаёт /api/v1/auth/oauth/native-bridge — страница перенаправляет в приложение (custom scheme).
 */
export function getOAuthHttpsBridgeRedirectUri(): string {
  const explicit = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_OAUTH_NATIVE_BRIDGE_URL?.trim() : "";
  if (explicit) return explicit.replace(/\/$/, "");
  const api =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CHAT_API_URL : undefined)?.replace(/\/$/, "") ||
    "https://chat.pirogov.ai";
  return `${api}/api/v1/auth/oauth/native-bridge`;
}
