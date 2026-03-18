/**
 * API сообщений ChatService (https://chat.pirogov.ai)
 * GET /api/v1/messages/
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface MessageResponse {
  message_id: string;
  sender_id: string;
  recipient_id: string | null;
  room_id: string | null;
  encrypted_data: string;
  encrypted_aes_key: string;
  nonce: string;
  signature: string | null;
  is_read: boolean;
  sent_at: string;
  /** true если в списке не отдали тело (большое); полное тело — по getMessage(id) */
  has_attachment?: boolean;
}

/** Получить одно сообщение по id (всегда полное тело, для подгрузки при has_attachment). */
export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<MessageResponse | null> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/messages/${encodeURIComponent(messageId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as MessageResponse;
  return data;
}

/** Сервер принимает limit от 1 до 100. roomId — ID чата (комнаты), при передаче возвращаются только сообщения этого чата. */
export async function getMessages(
  accessToken: string,
  limit = 100,
  offset = 0,
  unreadOnly = false,
  roomId?: string | null
): Promise<MessageResponse[]> {
  const url = new URL(`${BASE_URL.replace(/\/$/, "")}/api/v1/messages/`);
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set("offset", String(Math.max(0, offset)));
  if (unreadOnly) url.searchParams.set("unread_only", "true");
  if (roomId != null && roomId !== "") url.searchParams.set("room_id", roomId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as MessageResponse[];
  return Array.isArray(data) ? data : [];
}
