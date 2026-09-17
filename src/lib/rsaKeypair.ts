/**
 * RSA-4096 (RSA-OAEP SHA-256) keypair в PEM — совместимо с ChatService HybridEncryption.
 */

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function derToPem(der: ArrayBuffer, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const b64 = bufferToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function pemToBinary(pem: string, label: "PRIVATE KEY" | "PUBLIC KEY"): ArrayBuffer {
  const clean = pem
    .replace(new RegExp(`-----BEGIN ${label}-----`, "i"), "")
    .replace(new RegExp(`-----END ${label}-----`, "i"), "")
    .replace(/\s/g, "");
  return base64ToBuffer(clean);
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const binary = pemToBinary(pem, "PUBLIC KEY");
  return crypto.subtle.importKey(
    "spki",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binary = pemToBinary(pem, "PRIVATE KEY");
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

export interface ClientRsaKeypair {
  public_key: string;
  private_key: string;
}

/** Генерация пары на устройстве (private не уходит на сервер в режиме keys v2). */
export async function generateRsaKeypairPem(): Promise<ClientRsaKeypair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);

  return {
    public_key: derToPem(spki, "PUBLIC KEY"),
    private_key: derToPem(pkcs8, "PRIVATE KEY"),
  };
}

/**
 * Извлечь соответствующий публичный ключ (SPKI PEM) из приватного ключа (PKCS#8 PEM)
 * с использованием нативного WebCrypto JWK.
 */
export async function extractPublicKeyFromPrivateKeyPem(privateKeyPem: string): Promise<string> {
  const binary = pemToBinary(privateKeyPem, "PRIVATE KEY");
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", privKey);
  const pubJwk = {
    kty: "RSA",
    n: jwk.n,
    e: jwk.e,
    alg: "RSA-OAEP-256",
    ext: true,
    key_ops: ["encrypt"],
  };
  const pubKey = await crypto.subtle.importKey(
    "jwk",
    pubJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const spki = await crypto.subtle.exportKey("spki", pubKey);
  return derToPem(spki, "PUBLIC KEY");
}


/**
 * Зашифровать мастер-ключ для целевого устройства (Hybrid AES-256-GCM + RSA-OAEP).
 * Безопасно для ключей любого размера.
 */
export async function encryptMasterKeyForDevice(
  masterKeyPem: string,
  targetDevicePublicKeyPem: string
): Promise<string> {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encMaster = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    new TextEncoder().encode(masterKeyPem)
  );

  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const targetPubKey = await importPublicKey(targetDevicePublicKeyPem);
  const encAesKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    targetPubKey,
    rawAes
  );

  return btoa(
    JSON.stringify({
      enc_aes_key: bufferToBase64(encAesKey),
      nonce: bufferToBase64(nonce.buffer),
      ciphertext: bufferToBase64(encMaster),
    })
  );
}

/**
 * Расшифровать мастер-ключ, переданный от доверенного устройства (Hybrid AES-256-GCM + RSA-OAEP).
 */
export async function decryptMasterKeyFromDevice(
  payloadB64: string,
  devicePrivateKeyPem: string
): Promise<string> {
  const parsed = JSON.parse(atob(payloadB64));
  const devicePrivKey = await importPrivateKey(devicePrivateKeyPem);

  const encAesKey = base64ToBuffer(parsed.enc_aes_key);
  const rawAes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    devicePrivKey,
    encAesKey
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const nonce = new Uint8Array(base64ToBuffer(parsed.nonce));
  const ciphertext = base64ToBuffer(parsed.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
