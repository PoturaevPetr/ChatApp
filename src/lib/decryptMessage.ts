/**
 * Расшифровка сообщений от ChatService API (AES-256-GCM + RSA-OAEP).
 * Receive: signal envelopes, sender_key, legacy_user_e2e / hybrid_device_v0 (RSA wrap).
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

export interface DeviceEnvelopeLike {
  device_id: string;
  encrypted_aes_key?: string;
  body_b64?: string;
}

/**
 * Расшифровывает сообщение из API (legacy hybrid RSA + AES).
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

/**
 * Pick decrypt material: recipient_keys wrap, then local device envelope, then any envelope.
 */
export function pickEncryptedAesKeyForDevice(
  encryptedAesKey: string | undefined | null,
  deviceEnvelopes: DeviceEnvelopeLike[] | undefined | null,
  localDeviceId: string | null | undefined
): string | null {
  const candidates: string[] = [];

  if (Array.isArray(deviceEnvelopes) && deviceEnvelopes.length > 0 && localDeviceId) {
    const hit = deviceEnvelopes.find((e) => e.device_id === localDeviceId);
    const localKey = hit?.encrypted_aes_key || hit?.body_b64;
    if (typeof localKey === "string" && localKey.trim()) {
      candidates.push(localKey.trim());
    }
  }

  if (typeof encryptedAesKey === "string" && encryptedAesKey.trim()) {
    candidates.push(encryptedAesKey.trim());
  }

  if (Array.isArray(deviceEnvelopes) && deviceEnvelopes.length > 0) {
    for (const e of deviceEnvelopes) {
      const key = e?.encrypted_aes_key || e?.body_b64;
      if (typeof key === "string" && key.trim()) candidates.push(key.trim());
    }
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      return c;
    }
  }
  return null;
}

/** All distinct envelope bodies to try (signal may need alternate device wrap). */
export function listDecryptMaterialCandidates(
  encryptedAesKey: string | undefined | null,
  deviceEnvelopes: DeviceEnvelopeLike[] | undefined | null,
  localDeviceId: string | null | undefined
): string[] {
  const primary = pickEncryptedAesKeyForDevice(encryptedAesKey, deviceEnvelopes, localDeviceId);
  const out: string[] = [];
  const seen = new Set<string>();
  if (primary) {
    out.push(primary);
    seen.add(primary);
  }
  if (typeof encryptedAesKey === "string" && encryptedAesKey.trim() && !seen.has(encryptedAesKey.trim())) {
    out.push(encryptedAesKey.trim());
    seen.add(encryptedAesKey.trim());
  }
  if (Array.isArray(deviceEnvelopes)) {
    for (const e of deviceEnvelopes) {
      const key = (e?.encrypted_aes_key || e?.body_b64 || "").trim();
      if (key && !seen.has(key)) {
        out.push(key);
        seen.add(key);
      }
    }
  }
  return out;
}

async function tryDecryptWithMaterial(
  encryptedDataB64: string,
  nonceB64: string,
  privateKeyPem: string,
  material: string
): Promise<DecryptedContent | null> {
  try {
    const { isSenderKeyEnvelopeMeta, decryptGroupSenderKeyV0 } = await import("@/lib/senderKeys");
    if (isSenderKeyEnvelopeMeta(material)) {
      return decryptGroupSenderKeyV0({
        encryptedDataB64,
        nonceB64,
        envelopeRaw: material,
        privateKeyPem,
      });
    }
  } catch {
    /* fall through */
  }

  try {
    const { isSignalEnvelopeBody, decryptSignalEnvelope } = await import("@/lib/signalE2E");
    if (isSignalEnvelopeBody(material)) {
      return decryptSignalEnvelope(material);
    }
  } catch {
    /* fall through */
  }

  if (!encryptedDataB64 || !nonceB64) return null;
  return decryptMessage(encryptedDataB64, material, nonceB64, privateKeyPem);
}

export async function decryptMessageForDevice(
  encryptedDataB64: string,
  nonceB64: string,
  privateKeyPem: string,
  opts: {
    encryptedAesKey?: string | null;
    deviceEnvelopes?: DeviceEnvelopeLike[] | null;
    localDeviceId?: string | null;
  }
): Promise<DecryptedContent | null> {
  const { ensureSignalCryptoReady } = await import("@/lib/signalCryptoBootstrap");
  await ensureSignalCryptoReady().catch(() => {});

  const materials = listDecryptMaterialCandidates(
    opts.encryptedAesKey,
    opts.deviceEnvelopes,
    opts.localDeviceId
  );
  if (materials.length === 0) return null;

  for (const material of materials) {
    const content = await tryDecryptWithMaterial(
      encryptedDataB64,
      nonceB64,
      privateKeyPem,
      material
    );
    if (content) return content;
  }
  return null;
}
