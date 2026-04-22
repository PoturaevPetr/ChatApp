/**
 * API реакций на сообщения.
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export type MessageReactionRow = { userId: string; emoji: string };

function normalizeBatch(
  raw: Record<string, Array<{ user_id?: string; emoji?: string }>>,
): Record<string, MessageReactionRow[]> {
  const out: Record<string, MessageReactionRow[]> = {};
  for (const [mid, rows] of Object.entries(raw)) {
    out[mid] = (rows ?? [])
      .filter((r) => typeof r.user_id === "string" && typeof r.emoji === "string")
      .map((r) => ({ userId: String(r.user_id), emoji: String(r.emoji) }));
  }
  return out;
}

/** message_id -> список { userId, emoji } */
export async function getReactionsBatch(
  accessToken: string,
  roomId: string,
  messageIds: string[],
): Promise<Record<string, MessageReactionRow[]>> {
  const ids = messageIds.filter((id) => id && !id.startsWith("msg_"));
  if (!ids.length || !roomId.trim()) return {};
  const url = new URL(`${BASE_URL.replace(/\/$/, "")}/api/v1/messages/reactions/batch`);
  url.searchParams.set("room_id", roomId.trim());
  url.searchParams.set("message_ids", ids.join(","));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { reactions?: Record<string, Array<{ user_id?: string; emoji?: string }>> };
  return normalizeBatch(data.reactions ?? {});
}

export async function setMessageReaction(
  accessToken: string,
  messageId: string,
  emoji: string,
): Promise<{ removed: boolean; emoji: string }> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/messages/${encodeURIComponent(messageId)}/reactions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return {
    removed: Boolean((data as { removed?: boolean }).removed),
    emoji: String((data as { emoji?: string }).emoji ?? emoji),
  };
}
