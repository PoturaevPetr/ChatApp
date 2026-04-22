function b64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s/g, "");
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function pemToSpkiBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return b64ToBytes(body);
}

async function importRsaPublicKey(pem: string): Promise<CryptoKey> {
  const spki = bytesToArrayBuffer(pemToSpkiBytes(pem));
  return crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

export interface E2ERecipientKey {
  user_id: string;
  encrypted_aes_key: string;
}

export interface E2EEncryptedPayload {
  encrypted_data: string;
  nonce: string;
  recipient_keys: E2ERecipientKey[];
}

export async function encryptMessagePayloadForChatService(
  payload: Record<string, unknown>,
  readers: Array<{ userId: string; publicKeyPem: string }>
): Promise<E2EEncryptedPayload> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const rawAes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["encrypt"]);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  );

  const recipient_keys: E2ERecipientKey[] = [];
  for (const reader of readers) {
    const pub = await importRsaPublicKey(reader.publicKeyPem);
    const encAesBuf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawAes);
    recipient_keys.push({
      user_id: reader.userId,
      encrypted_aes_key: bytesToB64(new Uint8Array(encAesBuf)),
    });
  }

  return {
    encrypted_data: bytesToB64(new Uint8Array(encryptedBuf)),
    nonce: bytesToB64(nonce),
    recipient_keys,
  };
}
