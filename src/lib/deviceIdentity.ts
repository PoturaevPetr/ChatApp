/**
 * Локальный device_id + identity keys (V3.1).
 * Private в cryptoSecureStorage; на сервер уходит только public.
 */

import { generateRsaKeypairPem } from "@/lib/rsaKeypair";
import {
  cryptoSecureGet,
  cryptoSecureSet,
  deviceCryptoKey,
} from "@/lib/cryptoSecureStorage";
import { guessClientPlatformForApi } from "@/lib/clientDevicePlatform";

const DEVICE_ID_KEY = "crypto:local_device_id";

export interface LocalDeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  registrationId: number;
}

function randomDeviceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateLocalDeviceId(): Promise<string> {
  const existing = await cryptoSecureGet(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = randomDeviceId();
  await cryptoSecureSet(DEVICE_ID_KEY, id);
  return id;
}

export async function getOrCreateLocalDeviceIdentity(): Promise<LocalDeviceIdentity> {
  const deviceId = await getOrCreateLocalDeviceId();
  const privKey = deviceCryptoKey(deviceId, "identity_private");
  const pubKey = deviceCryptoKey(deviceId, "identity_public");
  const regKey = deviceCryptoKey(deviceId, "registration_id");

  let privateKeyPem = await cryptoSecureGet(privKey);
  let publicKeyPem = await cryptoSecureGet(pubKey);
  let registrationId = Number(await cryptoSecureGet(regKey) || "0");

  if (!privateKeyPem || !publicKeyPem) {
    const pair = await generateRsaKeypairPem();
    privateKeyPem = pair.private_key;
    publicKeyPem = pair.public_key;
    registrationId = Math.floor(Math.random() * 16380) + 1;
    await cryptoSecureSet(privKey, privateKeyPem);
    await cryptoSecureSet(pubKey, publicKeyPem);
    await cryptoSecureSet(regKey, String(registrationId));
  }

  return {
    deviceId,
    publicKeyPem,
    privateKeyPem,
    registrationId,
  };
}

export function guessDevicePlatform(): string {
  return guessClientPlatformForApi();
}

export function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  return "Browser";
}
