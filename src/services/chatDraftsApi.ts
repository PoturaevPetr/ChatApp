/**
 * API черновиков ChatService (Cloud Drafts).
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface DraftRemote {
  room_id: string;
  encrypted_data: string;
  nonce: string;
  encrypted_aes_key: string;
  updated_at: string;
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof (data as { detail?: string }).detail === "string"
    ? (data as { detail: string }).detail
    : res.statusText;
}

export async function listUserDrafts(accessToken: string): Promise<DraftRemote[]> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/drafts/`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as DraftRemote[];
}

export async function saveUserDraft(
  accessToken: string,
  roomId: string,
  body: { encrypted_data: string; nonce: string; encrypted_aes_key: string }
): Promise<DraftRemote> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/drafts/${encodeURIComponent(roomId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as DraftRemote;
}

export async function deleteUserDraft(accessToken: string, roomId: string): Promise<void> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/drafts/${encodeURIComponent(roomId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(await parseError(res));
}
