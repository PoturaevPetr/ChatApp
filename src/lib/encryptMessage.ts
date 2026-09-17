/**
 * Гибридное шифрование сообщений (Hybrid AES-256-GCM + RSA-OAEP).
 *
 * Создает случайный симметричный ключ K_msg для каждого сообщения,
 * шифрует тело сообщения через AES-256-GCM, а затем оборачивает K_msg
 * через RSA-OAEP для мастер-ключей и активных устройств всех участников чата.
 *
 * Это обеспечивает Zero-Knowledge безопасность на сервере и возможность
 * восстановления всей истории при входе на новом устройстве или после логаута.
 */

import { importPublicKey } from "@/lib/rsaKeypair";

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export interface RecipientKeyEntry {
  user_id: string;
  encrypted_aes_key: string;
}

export interface DeviceKeyEntry {
  device_id: string;
  type: "hybrid_rsa";
  body_b64: string;
  user_id: string;
}

export interface UserTargetPublicKey {
  userId: string;
  publicKeyPem: string;
  deviceId?: string;
}

export async function encryptMessageHybridRsa(
  payload: Record<string, unknown>,
  targets: UserTargetPublicKey[]
): Promise<{
  protocol: string;
  encrypted_data: string;
  nonce: string;
  recipient_keys: RecipientKeyEntry[];
  envelopes: DeviceKeyEntry[];
}> {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    plaintext
  );

  const rawAes = await crypto.subtle.exportKey("raw", aesKey);

  const recipientKeys: RecipientKeyEntry[] = [];
  const envelopes: DeviceKeyEntry[] = [];
  const seenUsers = new Set<string>();
  const seenDevices = new Set<string>();

  for (const target of targets) {
    if (!target.publicKeyPem) continue;
    try {
      const pubKey = await importPublicKey(target.publicKeyPem);
      const encAesKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        pubKey,
        rawAes
      );
      const wrapB64 = bufferToBase64(encAesKey);

      if (!seenUsers.has(target.userId)) {
        seenUsers.add(target.userId);
        recipientKeys.push({
          user_id: target.userId,
          encrypted_aes_key: wrapB64,
        });
      }

      if (target.deviceId) {
        const pairKey = `${target.userId}:${target.deviceId}`;
        if (!seenDevices.has(pairKey) && !seenDevices.has(target.deviceId)) {
          seenDevices.add(pairKey);
          seenDevices.add(target.deviceId);
          envelopes.push({
            device_id: target.deviceId,
            type: "hybrid_rsa",
            body_b64: wrapB64,
            user_id: target.userId,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to wrap AES key for target:", target.userId, e);
    }
  }

  return {
    protocol: "hybrid_rsa_v1",
    encrypted_data: bufferToBase64(encrypted),
    nonce: bufferToBase64(nonce.buffer),
    recipient_keys: recipientKeys,
    envelopes,
  };
}
