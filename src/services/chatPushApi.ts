/**
 * Регистрация FCM-токена в ChatService → Novu (subscriber credentials).
 * POST /api/v1/push/register
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface PushRegisterResponse {
  ok: boolean;
  novu_updated: boolean;
  skipped?: boolean;
  detail?: string | null;
}

export async function registerPushDevice(
  accessToken: string,
  token: string,
  platform: string
): Promise<PushRegisterResponse> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/push/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, platform }),
  });

  const data = (await res.json().catch(() => ({}))) as PushRegisterResponse & {
    detail?: string;
  };

  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return data;
}
