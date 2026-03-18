/**
 * Расшифровка сообщений от ChatService API (AES-256-GCM + RSA-OAEP).
 * Соответствует server/crypto/hybrid.py.
 */

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function pemToBinary(pem: string): ArrayBuffer {
  const lines = pem
    .replace(/-----BEGIN PRIVATE KEY-----/i, "")
    .replace(/-----END PRIVATE KEY-----/i, "")
    .replace(/\s/g, "");
  return base64ToBuffer(lines);
}

/**
 * Импорт RSA приватного ключа (PKCS#8) для расшифровки AES ключа.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binary = pemToBinary(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

export interface DecryptedContent {
  text?: string;
  [key: string]: unknown;
}

/**
 * Расшифровывает сообщение из API.
 * @returns Расшифрованный объект (например { text: "..." }) или null при ошибке.
 */
export async function decryptMessage(
  encryptedDataB64: string,
  encryptedAesKeyB64: string,
  nonceB64: string,
  privateKeyPem: string
): Promise<DecryptedContent | null> {
  try {
    const privateKey = await importPrivateKey(privateKeyPem);
    const encryptedAesKey = new Uint8Array(base64ToBuffer(encryptedAesKeyB64));
    const aesKeyRaw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedAesKey
    );

    const nonce = new Uint8Array(base64ToBuffer(nonceB64));
    const encryptedData = new Uint8Array(base64ToBuffer(encryptedDataB64));

    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        tagLength: 128,
      },
      await crypto.subtle.importKey(
        "raw",
        aesKeyRaw,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      ),
      encryptedData
    );

    const text = new TextDecoder().decode(plain);
    return JSON.parse(text) as DecryptedContent;
  } catch {
    return null;
  }
}
