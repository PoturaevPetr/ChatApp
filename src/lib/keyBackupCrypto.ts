/**
 * Passphrase-encrypted backup private key (AES-256-GCM + PBKDF2-SHA-256).
 * Совместимо с docs/CRYPTO_KEYS_V2.md.
 */

const DEFAULT_ITERATIONS = 310_000;

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function u8ToB64(bytes: Uint8Array): string {
  return bufToB64(toArrayBuffer(bytes));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export interface KeyBackupPayload {
  ciphertext: string;
  kdf: "pbkdf2-sha256";
  kdf_salt_b64: string;
  kdf_params: { iterations: number };
  wrap_alg: "aes-256-gcm";
  nonce_b64: string;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPrivateKeyBackup(
  privateKeyPem: string,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS
): Promise<KeyBackupPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    key,
    new TextEncoder().encode(privateKeyPem)
  );
  return {
    ciphertext: bufToB64(ct),
    kdf: "pbkdf2-sha256",
    kdf_salt_b64: u8ToB64(salt),
    kdf_params: { iterations },
    wrap_alg: "aes-256-gcm",
    nonce_b64: u8ToB64(nonce),
  };
}

export async function decryptPrivateKeyBackup(
  backup: KeyBackupPayload,
  passphrase: string
): Promise<string> {
  const iterations = Number(backup.kdf_params?.iterations) || DEFAULT_ITERATIONS;
  const salt = new Uint8Array(b64ToBuf(backup.kdf_salt_b64));
  const nonce = new Uint8Array(b64ToBuf(backup.nonce_b64));
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    key,
    b64ToBuf(backup.ciphertext)
  );
  return new TextDecoder().decode(plain);
}
