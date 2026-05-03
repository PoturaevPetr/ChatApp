/**
 * Клиентские настройки с ChatService (после входа).
 */

const CHAT_BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai").replace(/\/+$/, "")
    : "https://chat.pirogov.ai";

export type MeetServiceConfigResponse = {
  meet_service_url: string | null;
};

/** JWT access. Если на сервере Meet не настроен — приходит meet_service_url: null. */
export async function fetchMeetServicePublicUrl(accessToken: string): Promise<string | null> {
  const res = await fetch(`${CHAT_BASE}/api/v1/client/meet-service`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as MeetServiceConfigResponse;
  const url = typeof data.meet_service_url === "string" ? data.meet_service_url.trim() : "";
  return url ? url.replace(/\/+$/, "") : null;
}
