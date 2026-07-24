/**
 * signal_v1 encrypt/decrypt via X3DH + Double Ratchet
 * (@privacyresearch/libsignal-protocol-typescript)
 */

import {
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type MessageType,
} from "@privacyresearch/libsignal-protocol-typescript";
import type { MultiDeviceE2EPayload } from "@/lib/cryptoProtocol";
import { abToB64, b64ToAb, b64ToBinaryString, binaryStringToB64, signalDeviceIdFromUuid } from "@/lib/signalBuffers";
import { getSignalStore } from "@/lib/signalProtocolStore";
import { ensureSignalCryptoReady } from "@/lib/signalCryptoBootstrap";
import type { DecryptedContent } from "@/lib/decryptMessage";

export interface SignalDeviceTarget {
  userId: string;
  deviceId: string;
  registrationId: number;
  identityKeyPublicB64: string;
  signedPrekeyId: number;
  signedPrekeyPublicB64: string;
  signedPrekeySignatureB64: string;
  oneTimePrekey?: { key_id: number; public_key: string } | null;
}

export interface SignalEnvelopeBody {
  v: 1;
  msgType: number;
  body_b64: string;
  registrationId?: number;
  /** Remote party for SessionCipher on decrypt */
  sender_user_id: string;
  sender_device_id: string;
}

function addressFor(userId: string, deviceUuid: string): SignalProtocolAddress {
  return new SignalProtocolAddress(userId, signalDeviceIdFromUuid(deviceUuid));
}

function toDeviceType(t: SignalDeviceTarget): DeviceType {
  const device: DeviceType = {
    identityKey: b64ToAb(t.identityKeyPublicB64),
    registrationId: t.registrationId,
    signedPreKey: {
      keyId: t.signedPrekeyId,
      publicKey: b64ToAb(t.signedPrekeyPublicB64),
      signature: b64ToAb(t.signedPrekeySignatureB64),
    },
  };
  if (t.oneTimePrekey?.public_key) {
    device.preKey = {
      keyId: t.oneTimePrekey.key_id,
      publicKey: b64ToAb(t.oneTimePrekey.public_key),
    };
  }
  return device;
}

function packEnvelope(
  msg: MessageType,
  senderUserId: string,
  senderDeviceId: string
): string {
  const body = msg.body ?? "";
  const packed: SignalEnvelopeBody = {
    v: 1,
    msgType: msg.type,
    body_b64: binaryStringToB64(body),
    registrationId: msg.registrationId,
    sender_user_id: senderUserId,
    sender_device_id: senderDeviceId,
  };
  return JSON.stringify(packed);
}

function unpackEnvelope(raw: string): SignalEnvelopeBody | null {
  try {
    const o = JSON.parse(raw) as SignalEnvelopeBody;
    if (
      o?.v === 1 &&
      typeof o.msgType === "number" &&
      typeof o.body_b64 === "string" &&
      typeof o.sender_user_id === "string" &&
      typeof o.sender_device_id === "string"
    ) {
      return o;
    }
  } catch {
    /* not signal json */
  }
  return null;
}

export function isSignalEnvelopeBody(raw: string): boolean {
  return unpackEnvelope(raw) != null;
}

async function ensureSession(target: SignalDeviceTarget): Promise<void> {
  const store = getSignalStore();
  const addr = addressFor(target.userId, target.deviceId);
  const cipher = new SessionCipher(store, addr);
  if (await cipher.hasOpenSession()) return;
  const builder = new SessionBuilder(store, addr);
  await builder.processPreKey(toDeviceType(target));
}

/**
 * Encrypt JSON payload to each Signal-capable device (full ciphertext per envelope).
 */
export async function encryptMessagePayloadSignalV1(
  payload: Record<string, unknown>,
  targets: SignalDeviceTarget[],
  senderUserId: string,
  senderDeviceId: string
): Promise<MultiDeviceE2EPayload> {
  await ensureSignalCryptoReady();
  if (targets.length === 0) throw new Error("No Signal devices for encrypt");
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const envelopes: MultiDeviceE2EPayload["envelopes"] = [];
  const byUser = new Map<string, string>();
  const store = getSignalStore();

  for (const t of targets) {
    await ensureSession(t);
    const addr = addressFor(t.userId, t.deviceId);
    const cipher = new SessionCipher(store, addr);
    const msg = await cipher.encrypt(
      plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength)
    );
    const body_b64 = packEnvelope(msg, senderUserId, senderDeviceId);
    const envType = msg.type === 3 ? "prekey" : "message";
    envelopes.push({
      device_id: t.deviceId,
      type: envType,
      body_b64,
      user_id: t.userId,
    });
    if (!byUser.has(t.userId)) byUser.set(t.userId, body_b64);
  }

  return {
    protocol: "signal_v1",
    encrypted_data: "",
    nonce: "",
    envelopes,
    recipient_keys: Array.from(byUser.entries()).map(([user_id, encrypted_aes_key]) => ({
      user_id,
      encrypted_aes_key,
    })),
  };
}

/**
 * Decrypt a signal envelope for this device (sender embedded in packed body).
 */
export async function decryptSignalEnvelope(envelopeRaw: string): Promise<DecryptedContent | null> {
  const packed = unpackEnvelope(envelopeRaw);
  if (!packed) return null;
  try {
    await ensureSignalCryptoReady();
    const store = getSignalStore();
    const addr = addressFor(packed.sender_user_id, packed.sender_device_id);
    const cipher = new SessionCipher(store, addr);
    const bodyBin = b64ToBinaryString(packed.body_b64);
    let plainAb: ArrayBuffer;
    if (packed.msgType === 3) {
      try {
        plainAb = await cipher.decryptPreKeyWhisperMessage(bodyBin, "binary");
      } catch {
        // PreKey already consumed on first decrypt — session persists, inner body is WhisperMessage.
        if (!(await cipher.hasOpenSession())) return null;
        const { PreKeyWhisperMessage } = await import("@privacyresearch/libsignal-protocol-protobuf-ts");
        const outer = b64ToAb(packed.body_b64);
        const view = new Uint8Array(outer);
        const preKeyProto = PreKeyWhisperMessage.decode(view.slice(1));
        const inner = preKeyProto.message;
        if (!inner?.length) return null;
        const innerBytes = inner instanceof Uint8Array ? inner : new Uint8Array(inner);
        let innerBin = "";
        for (let i = 0; i < innerBytes.length; i += 1) {
          innerBin += String.fromCharCode(innerBytes[i]);
        }
        plainAb = await cipher.decryptWhisperMessage(innerBin, "binary");
      }
    } else {
      plainAb = await cipher.decryptWhisperMessage(bodyBin, "binary");
    }
    const text = new TextDecoder().decode(new Uint8Array(plainAb));
    return JSON.parse(text) as DecryptedContent;
  } catch {
    return null;
  }
}
