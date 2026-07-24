const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface LlmEncryptedKeyBundle {
  encrypted_data: string;
  encrypted_aes_key: string;
  nonce: string;
}

export interface LlmAccessResponse {
  enabled: boolean;
  base_url?: string | null;
  api_key_header?: string | null;
  encrypted_api_key?: LlmEncryptedKeyBundle | null;
}

export async function fetchLlmAccess(
  accessToken: string,
  deviceId: string,
  signal?: AbortSignal,
): Promise<LlmAccessResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/llm/access`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Device-Id": deviceId,
      Accept: "application/json",
    },
    signal,
  });

  const raw = await res.text();
  let data: LlmAccessResponse & { detail?: string } = { enabled: false };
  try {
    data = JSON.parse(raw) as LlmAccessResponse & { detail?: string };
  } catch {
    /* */
  }

  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : raw.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return data;
}
