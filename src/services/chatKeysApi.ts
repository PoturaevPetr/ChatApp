/**
 * API ключей ChatService — получение своей ключевой пары при входе с любого устройства.
 * GET /api/v1/keys/me/keypair
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface KeypairResponse {
  public_key: string;
  private_key: string;
}

export interface PublicKeyResponse {
  user_id: string;
  public_key: string;
  key_fingerprint: string;
  created_at: string;
}

export async function getMyKeypair(accessToken: string): Promise<KeypairResponse> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/keys/me/keypair`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  const detail =
    typeof (data as { detail?: string }).detail === "string"
      ? (data as { detail: string }).detail
      : res.statusText;

  if (!res.ok) {
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return data as KeypairResponse;
}

export async function getPublicKey(accessToken: string, userId: string): Promise<PublicKeyResponse> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/keys/public/${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  const detail =
    typeof (data as { detail?: string }).detail === "string"
      ? (data as { detail: string }).detail
      : res.statusText;
  if (!res.ok) {
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return data as PublicKeyResponse;
}
