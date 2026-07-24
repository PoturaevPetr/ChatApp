/**
 * API ключей ChatService — passphrase backup (private только локально).
 * Public user_keys routes removed (V3.5) — device keys via `/devices`.
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface KeyBackupRemote {
  ciphertext: string;
  kdf: string;
  kdf_salt_b64: string;
  kdf_params: { iterations?: number; [k: string]: unknown };
  wrap_alg: string;
  nonce_b64: string;
  updated_at?: string | null;
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof (data as { detail?: string }).detail === "string"
    ? (data as { detail: string }).detail
    : res.statusText;
}

export async function putKeyBackup(accessToken: string, body: KeyBackupRemote): Promise<KeyBackupRemote> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/keys/me/backup`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as KeyBackupRemote;
}

export async function getKeyBackup(accessToken: string): Promise<KeyBackupRemote> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/keys/me/backup`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error(await parseError(res)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as KeyBackupRemote;
}
