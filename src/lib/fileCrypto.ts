/**
 * Шифрование вложений на клиенте (AES-256-GCM). Сервер хранит только ciphertext в БД.
 */

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const IV_LENGTH = 12;

export interface EncryptedBlobParts {
  ciphertext: ArrayBuffer;
  key_b64: string;
  nonce_b64: string;
}

/** Шифрует файл/превью перед загрузкой на API. */
export async function encryptAttachmentBytes(plain: ArrayBuffer): Promise<EncryptedBlobParts> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    ciphertext,
    key_b64: bytesToBase64(rawKey),
    nonce_b64: bytesToBase64(iv),
  };
}

/** Расшифровка после скачивания ciphertext с API. */
export async function decryptAttachmentBytes(
  ciphertext: ArrayBuffer,
  key_b64: string,
  nonce_b64: string,
): Promise<ArrayBuffer> {
  const rawKey = base64ToBytes(key_b64);
  const iv = base64ToBytes(nonce_b64);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ciphertext,
  );
}
