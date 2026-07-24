/**
 * Local Signal identity + prekeys (Curve25519). Parallel to RSA device identity (hybrid).
 */

import { KeyHelper } from "@privacyresearch/libsignal-protocol-typescript";
import { cryptoSecureGet, cryptoSecureSet, deviceCryptoKey } from "@/lib/cryptoSecureStorage";
import { getOrCreateLocalDeviceId } from "@/lib/deviceIdentity";
import { abToB64, b64ToAb } from "@/lib/signalBuffers";
import { getSignalStore, putLocalIdentity } from "@/lib/signalProtocolStore";
import { ensureSignalCryptoReady } from "@/lib/signalCryptoBootstrap";

const OTP_COUNT = 25;
const OTP_REPLENISH_THRESHOLD = 10;
const META_KEY = (deviceId: string) => deviceCryptoKey(deviceId, "signal_meta");

export interface SignalPublicBundle {
  registrationId: number;
  identityKeyPublicB64: string;
  signedPrekeyId: number;
  signedPrekeyPublicB64: string;
  signedPrekeySignatureB64: string;
  oneTimePrekeys: { key_id: number; public_key: string }[];
}

interface SignalMeta {
  ready: boolean;
  signedPreKeyId: number;
  otpKeyIds: number[];
}

async function loadMeta(deviceId: string): Promise<SignalMeta | null> {
  const raw = await cryptoSecureGet(META_KEY(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SignalMeta;
  } catch {
    return null;
  }
}

/**
 * Ensure Curve25519 identity + signed prekey + OTP exist in secure store.
 * Returns public material for POST /devices/register.
 */
export async function ensureSignalIdentity(): Promise<SignalPublicBundle> {
  await ensureSignalCryptoReady();
  const deviceId = await getOrCreateLocalDeviceId();
  const store = getSignalStore();
  let meta = await loadMeta(deviceId);

  let identity = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();

  if (!identity || registrationId == null) {
    identity = await KeyHelper.generateIdentityKeyPair();
    registrationId = KeyHelper.generateRegistrationId();
    await putLocalIdentity(identity, registrationId);
  }

  let signedPreKeyId = meta?.signedPreKeyId ?? 1;
  let signedKp = await store.loadSignedPreKey(signedPreKeyId);
  let signatureB64: string | null = null;

  if (!signedKp || !meta?.ready) {
    signedPreKeyId = Math.floor(Math.random() * 0xfffffe) + 1;
    const signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
    await store.storeSignedPreKey(signedPreKeyId, signed.keyPair);
    signedKp = signed.keyPair;
    signatureB64 = abToB64(signed.signature);
    // Keep signature for upload — store beside meta
    await cryptoSecureSet(
      deviceCryptoKey(deviceId, "signal_signed_sig"),
      signatureB64
    );
  } else {
    signatureB64 = await cryptoSecureGet(deviceCryptoKey(deviceId, "signal_signed_sig"));
    if (!signatureB64) {
      // regenerate signed prekey if signature missing
      signedPreKeyId = Math.floor(Math.random() * 0xfffffe) + 1;
      const signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
      await store.storeSignedPreKey(signedPreKeyId, signed.keyPair);
      signedKp = signed.keyPair;
      signatureB64 = abToB64(signed.signature);
      await cryptoSecureSet(deviceCryptoKey(deviceId, "signal_signed_sig"), signatureB64);
    }
  }

  let otpKeyIds = meta?.otpKeyIds ?? [];
  const oneTimePrekeys: { key_id: number; public_key: string }[] = [];

  if (otpKeyIds.length < 5) {
    otpKeyIds = [];
    const base = Math.floor(Math.random() * 0x100000) + 1;
    for (let i = 0; i < OTP_COUNT; i += 1) {
      const keyId = base + i;
      const pre = await KeyHelper.generatePreKey(keyId);
      await store.storePreKey(keyId, pre.keyPair);
      otpKeyIds.push(keyId);
      oneTimePrekeys.push({
        key_id: keyId,
        public_key: abToB64(pre.keyPair.pubKey),
      });
    }
  } else {
    for (const keyId of otpKeyIds) {
      const kp = await store.loadPreKey(keyId);
      if (kp) {
        oneTimePrekeys.push({ key_id: keyId, public_key: abToB64(kp.pubKey) });
      }
    }
  }

  meta = { ready: true, signedPreKeyId, otpKeyIds };
  await cryptoSecureSet(META_KEY(deviceId), JSON.stringify(meta));

  return {
    registrationId,
    identityKeyPublicB64: abToB64(identity.pubKey),
    signedPrekeyId: signedPreKeyId,
    signedPrekeyPublicB64: abToB64(signedKp.pubKey),
    signedPrekeySignatureB64: signatureB64,
    oneTimePrekeys,
  };
}

/**
 * Generate fresh OTP batch and return publics for PUT /devices/me/prekeys.
 * Updates local meta otpKeyIds (keeps existing unconsumed private keys in store).
 */
export async function generateOneTimePrekeysForUpload(
  count = OTP_COUNT
): Promise<{ key_id: number; public_key: string }[]> {
  const deviceId = await getOrCreateLocalDeviceId();
  const store = getSignalStore();
  const meta = (await loadMeta(deviceId)) ?? {
    ready: true,
    signedPreKeyId: 1,
    otpKeyIds: [] as number[],
  };
  const base = Math.floor(Math.random() * 0x100000) + 1;
  const oneTimePrekeys: { key_id: number; public_key: string }[] = [];
  const newIds: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const keyId = base + i;
    const pre = await KeyHelper.generatePreKey(keyId);
    await store.storePreKey(keyId, pre.keyPair);
    newIds.push(keyId);
    oneTimePrekeys.push({ key_id: keyId, public_key: abToB64(pre.keyPair.pubKey) });
  }
  meta.otpKeyIds = [...meta.otpKeyIds, ...newIds];
  await cryptoSecureSet(META_KEY(deviceId), JSON.stringify(meta));
  return oneTimePrekeys;
}

export { OTP_REPLENISH_THRESHOLD, OTP_COUNT };

/** Public-only view for debugging / UI. */
export async function getLocalSignalIdentityPublicB64(): Promise<string | null> {
  const store = getSignalStore();
  const identity = await store.getIdentityKeyPair();
  if (!identity) return null;
  return abToB64(identity.pubKey);
}

export function decodeSignalPublicKey(b64: string): ArrayBuffer {
  return b64ToAb(b64);
}
