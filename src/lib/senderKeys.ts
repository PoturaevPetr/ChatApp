/**
 * sender_key_v0 — Signal-style group sender keys (Kindred).
 * One AES body per group message; SKDM distributed via pairwise Signal/hybrid envelopes.
 */

import { cryptoSecureGet, cryptoSecureSet } from "@/lib/cryptoSecureStorage";
import { abToB64, b64ToAb } from "@/lib/signalBuffers";
import type { MultiDeviceE2EPayload } from "@/lib/cryptoProtocol";
import type { DecryptedContent } from "@/lib/decryptMessage";
import type { SignalDeviceTarget } from "@/lib/signalE2E";
import { encryptMessagePayloadSignalV1, isSignalEnvelopeBody, decryptSignalEnvelope } from "@/lib/signalE2E";
import { decryptMessage } from "@/lib/decryptMessage";

export interface SenderKeyState {
  keyId: number;
  chainKeyB64: string;
  iteration: number;
  roomId: string;
  senderUserId: string;
  senderDeviceId: string;
  /** Recent message keys for decrypting own/out-of-order (iteration → b64) */
  recentMessageKeys?: Record<string, string>;
}

export interface SenderKeyDistribution {
  v: 1;
  t: "skdm";
  room_id: string;
  sender_user_id: string;
  sender_device_id: string;
  key_id: number;
  chain_key_b64: string;
  iteration: number;
}

export interface SenderKeyEnvelopeMeta {
  v: 1;
  t: "sender_key" | "skdm_wrap";
  room_id: string;
  sender_user_id: string;
  sender_device_id: string;
  key_id: number;
  iteration: number;
  /** Present when t=skdm_wrap: pairwise ciphertext (signal JSON or RSA wrap handled by outer) */
  skdm_inner?: string;
}

function storageKey(roomId: string, senderUserId: string, senderDeviceId: string): string {
  return `signal:senderkey:${roomId}:${senderUserId}:${senderDeviceId}`;
}

function bytesToB64(bytes: Uint8Array): string {
  return abToB64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(b64ToAb(b64));
}

async function hmacSha256(key: Uint8Array, label: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(label));
  return new Uint8Array(sig);
}

async function deriveMessageAndChain(chainKey: Uint8Array): Promise<{
  messageKey: Uint8Array;
  nextChain: Uint8Array;
}> {
  const messageKey = await hmacSha256(chainKey, "KindredSKMessage");
  const nextChain = await hmacSha256(chainKey, "KindredSKChain");
  return { messageKey, nextChain };
}

export async function loadSenderKey(
  roomId: string,
  senderUserId: string,
  senderDeviceId: string
): Promise<SenderKeyState | null> {
  const raw = await cryptoSecureGet(storageKey(roomId, senderUserId, senderDeviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SenderKeyState;
  } catch {
    return null;
  }
}

export async function saveSenderKey(state: SenderKeyState): Promise<void> {
  await cryptoSecureSet(
    storageKey(state.roomId, state.senderUserId, state.senderDeviceId),
    JSON.stringify(state)
  );
}

function distFlagKey(roomId: string, destDeviceId: string, keyId: number): string {
  return `signal:skdm_sent:${roomId}:${destDeviceId}:${keyId}`;
}

export async function markSkdmSent(roomId: string, destDeviceId: string, keyId: number): Promise<void> {
  await cryptoSecureSet(distFlagKey(roomId, destDeviceId, keyId), "1");
}

export async function wasSkdmSent(roomId: string, destDeviceId: string, keyId: number): Promise<boolean> {
  return (await cryptoSecureGet(distFlagKey(roomId, destDeviceId, keyId))) === "1";
}

export async function getOrCreateLocalSenderKey(
  roomId: string,
  senderUserId: string,
  senderDeviceId: string
): Promise<SenderKeyState> {
  const existing = await loadSenderKey(roomId, senderUserId, senderDeviceId);
  if (existing) return existing;
  const chainKey = crypto.getRandomValues(new Uint8Array(32));
  const state: SenderKeyState = {
    keyId: Math.floor(Math.random() * 0xfffffe) + 1,
    chainKeyB64: bytesToB64(chainKey),
    iteration: 0,
    roomId,
    senderUserId,
    senderDeviceId,
  };
  await saveSenderKey(state);
  return state;
}

function toDistribution(state: SenderKeyState): SenderKeyDistribution {
  return {
    v: 1,
    t: "skdm",
    room_id: state.roomId,
    sender_user_id: state.senderUserId,
    sender_device_id: state.senderDeviceId,
    key_id: state.keyId,
    chain_key_b64: state.chainKeyB64,
    iteration: state.iteration,
  };
}

export async function ingestSenderKeyDistribution(skdm: SenderKeyDistribution): Promise<void> {
  const state: SenderKeyState = {
    keyId: skdm.key_id,
    chainKeyB64: skdm.chain_key_b64,
    iteration: skdm.iteration,
    roomId: skdm.room_id,
    senderUserId: skdm.sender_user_id,
    senderDeviceId: skdm.sender_device_id,
  };
  await saveSenderKey(state);
}

function u8ToAb(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

async function aesGcmEncrypt(
  messageKey: Uint8Array,
  plaintext: Uint8Array,
  iteration: number
): Promise<{ ciphertextB64: string; nonceB64: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`sk:${iteration}`);
  const key = await crypto.subtle.importKey("raw", u8ToAb(messageKey), { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: u8ToAb(nonce), additionalData: u8ToAb(aad), tagLength: 128 },
    key,
    u8ToAb(plaintext)
  );
  return { ciphertextB64: bytesToB64(new Uint8Array(ct)), nonceB64: bytesToB64(nonce) };
}

async function aesGcmDecrypt(
  messageKey: Uint8Array,
  ciphertextB64: string,
  nonceB64: string,
  iteration: number
): Promise<Uint8Array | null> {
  try {
    const aad = new TextEncoder().encode(`sk:${iteration}`);
    const key = await crypto.subtle.importKey("raw", u8ToAb(messageKey), { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: u8ToAb(b64ToBytes(nonceB64)),
        additionalData: u8ToAb(aad),
        tagLength: 128,
      },
      key,
      u8ToAb(b64ToBytes(ciphertextB64))
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/**
 * Encrypt group payload with local sender key; build envelopes (SKDM wrap or marker) for all devices.
 */
export async function encryptGroupSenderKeyV0(opts: {
  roomId: string;
  payload: Record<string, unknown>;
  senderUserId: string;
  senderDeviceId: string;
  signalTargets: SignalDeviceTarget[];
}): Promise<MultiDeviceE2EPayload> {
  if (!opts.signalTargets.length) {
    throw new Error("signalTargets required for sender_key_v0");
  }
  const state = await getOrCreateLocalSenderKey(opts.roomId, opts.senderUserId, opts.senderDeviceId);
  const chain = b64ToBytes(state.chainKeyB64);
  const { messageKey, nextChain } = await deriveMessageAndChain(chain);
  const iteration = state.iteration;
  const plaintext = new TextEncoder().encode(JSON.stringify(opts.payload));
  const { ciphertextB64, nonceB64 } = await aesGcmEncrypt(messageKey, plaintext, iteration);

  const recent = { ...(state.recentMessageKeys || {}) };
  recent[String(iteration)] = bytesToB64(messageKey);
  const recentKeys = Object.keys(recent);
  if (recentKeys.length > 120) {
    recentKeys
      .map(Number)
      .sort((a, b) => a - b)
      .slice(0, recentKeys.length - 100)
      .forEach((k) => delete recent[String(k)]);
  }

  const nextState: SenderKeyState = {
    ...state,
    chainKeyB64: bytesToB64(nextChain),
    iteration: iteration + 1,
    recentMessageKeys: recent,
  };
  await saveSenderKey(nextState);

  const skdm = toDistribution(state);
  const skdmForMsg: SenderKeyDistribution = {
    ...skdm,
    chain_key_b64: state.chainKeyB64,
    iteration,
  };

  const envelopes: MultiDeviceE2EPayload["envelopes"] = [];
  const byUser = new Map<string, string>();

  for (const t of opts.signalTargets) {
    const needSkdm = !(await wasSkdmSent(opts.roomId, t.deviceId, state.keyId));
    if (needSkdm) {
      const wrap = await encryptMessagePayloadSignalV1(
        { _skdm: skdmForMsg },
        [t],
        opts.senderUserId,
        opts.senderDeviceId
      );
      const body = wrap.envelopes[0]?.body_b64 ?? "";
      const meta: SenderKeyEnvelopeMeta = {
        v: 1,
        t: "skdm_wrap",
        room_id: opts.roomId,
        sender_user_id: opts.senderUserId,
        sender_device_id: opts.senderDeviceId,
        key_id: state.keyId,
        iteration,
        skdm_inner: body,
      };
      const body_b64 = JSON.stringify(meta);
      envelopes.push({
        device_id: t.deviceId,
        type: "skdm",
        body_b64,
        user_id: t.userId,
      });
      if (!byUser.has(t.userId)) byUser.set(t.userId, body_b64);
      await markSkdmSent(opts.roomId, t.deviceId, state.keyId);
    } else {
      const meta: SenderKeyEnvelopeMeta = {
        v: 1,
        t: "sender_key",
        room_id: opts.roomId,
        sender_user_id: opts.senderUserId,
        sender_device_id: opts.senderDeviceId,
        key_id: state.keyId,
        iteration,
      };
      const body_b64 = JSON.stringify(meta);
      envelopes.push({
        device_id: t.deviceId,
        type: "sender_key",
        body_b64,
        user_id: t.userId,
      });
      if (!byUser.has(t.userId)) byUser.set(t.userId, body_b64);
    }
  }

  return {
    protocol: "sender_key_v0",
    encrypted_data: ciphertextB64,
    nonce: nonceB64,
    envelopes,
    recipient_keys: Array.from(byUser.entries()).map(([user_id, encrypted_aes_key]) => ({
      user_id,
      encrypted_aes_key,
    })),
  };
}

function parseEnvelopeMeta(raw: string): SenderKeyEnvelopeMeta | null {
  try {
    const o = JSON.parse(raw) as SenderKeyEnvelopeMeta;
    if (o?.v === 1 && (o.t === "sender_key" || o.t === "skdm_wrap")) return o;
  } catch {
    /* */
  }
  return null;
}

export function isSenderKeyEnvelopeMeta(raw: string): boolean {
  return parseEnvelopeMeta(raw) != null;
}

/**
 * Decrypt group message: process SKDM if present, then AES with sender chain.
 */
export async function decryptGroupSenderKeyV0(opts: {
  encryptedDataB64: string;
  nonceB64: string;
  envelopeRaw: string;
  privateKeyPem: string;
}): Promise<DecryptedContent | null> {
  const meta = parseEnvelopeMeta(opts.envelopeRaw);
  if (!meta) return null;

  if (meta.t === "skdm_wrap" && meta.skdm_inner) {
    let skdmPayload: DecryptedContent | null = null;
    if (isSignalEnvelopeBody(meta.skdm_inner)) {
      skdmPayload = await decryptSignalEnvelope(meta.skdm_inner);
    } else {
      try {
        const hybrid = JSON.parse(meta.skdm_inner) as {
          encrypted_data: string;
          nonce: string;
          encrypted_aes_key: string;
        };
        skdmPayload = await decryptMessage(
          hybrid.encrypted_data,
          hybrid.encrypted_aes_key,
          hybrid.nonce,
          opts.privateKeyPem
        );
      } catch {
        skdmPayload = null;
      }
    }
    const skdm = (skdmPayload as { _skdm?: SenderKeyDistribution } | null)?._skdm;
    if (skdm) await ingestSenderKeyDistribution(skdm);
  }

  let state = await loadSenderKey(meta.room_id, meta.sender_user_id, meta.sender_device_id);
  if (!state) return null;

  const target = meta.iteration;
  let messageKey: Uint8Array;

  if (state.recentMessageKeys?.[String(target)]) {
    messageKey = b64ToBytes(state.recentMessageKeys[String(target)]);
  } else {
    let chain = b64ToBytes(state.chainKeyB64);
    let iter = state.iteration;
    if (target < iter) return null;
    while (iter < target) {
      const stepped = await deriveMessageAndChain(chain);
      chain = stepped.nextChain;
      iter += 1;
    }
    const derived = await deriveMessageAndChain(chain);
    messageKey = derived.messageKey;
    await saveSenderKey({
      ...state,
      chainKeyB64: bytesToB64(derived.nextChain),
      iteration: target + 1,
      recentMessageKeys: {
        ...(state.recentMessageKeys || {}),
        [String(target)]: bytesToB64(messageKey),
      },
    });
  }

  const plain = await aesGcmDecrypt(messageKey, opts.encryptedDataB64, opts.nonceB64, target);
  if (!plain) return null;

  try {
    return JSON.parse(new TextDecoder().decode(plain)) as DecryptedContent;
  } catch {
    return null;
  }
}
