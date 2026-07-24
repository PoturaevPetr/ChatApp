/**
 * Collect Signal-capable device targets (X3DH bundles).
 * Uses listUserDevices (no OTP consume) when session already open;
 * key-bundle only for devices that need a new session.
 */

import {
  SessionCipher,
  SignalProtocolAddress,
} from "@privacyresearch/libsignal-protocol-typescript";
import {
  getUserKeyBundle,
  listUserDevices,
  type DeviceBundleItem,
} from "@/services/chatDevicesApi";
import type { SignalDeviceTarget } from "@/lib/signalE2E";
import { signalDeviceIdFromUuid } from "@/lib/signalBuffers";
import { getSignalStore } from "@/lib/signalProtocolStore";
import { ensureSignalCryptoReady } from "@/lib/signalCryptoBootstrap";

function isSignalReady(d: DeviceBundleItem): boolean {
  return Boolean(
    d.signal_identity_key_public &&
      d.signed_prekey_id != null &&
      d.signed_prekey_public &&
      d.signed_prekey_signature
  );
}

function toTarget(uid: string, d: DeviceBundleItem, withOtp: boolean): SignalDeviceTarget {
  return {
    userId: uid,
    deviceId: d.device_id,
    registrationId: d.registration_id,
    identityKeyPublicB64: d.signal_identity_key_public!,
    signedPrekeyId: d.signed_prekey_id!,
    signedPrekeyPublicB64: d.signed_prekey_public!,
    signedPrekeySignatureB64: d.signed_prekey_signature!,
    oneTimePrekey:
      withOtp && d.one_time_prekey
        ? { key_id: d.one_time_prekey.key_id, public_key: d.one_time_prekey.public_key }
        : null,
  };
}

async function hasOpenSession(userId: string, deviceUuid: string): Promise<boolean> {
  try {
    const store = getSignalStore();
    const addr = new SignalProtocolAddress(userId, signalDeviceIdFromUuid(deviceUuid));
    const cipher = new SessionCipher(store, addr);
    return await cipher.hasOpenSession();
  } catch {
    return false;
  }
}

export async function collectSignalTargetsForUsers(
  accessToken: string,
  userIds: string[]
): Promise<SignalDeviceTarget[] | null> {
  await ensureSignalCryptoReady();
  const unique = Array.from(new Set(userIds.map(String).filter(Boolean)));
  const all: SignalDeviceTarget[] = [];

  for (const uid of unique) {
    let listed: Awaited<ReturnType<typeof listUserDevices>>;
    try {
      listed = await listUserDevices(accessToken, uid);
    } catch {
      return null;
    }
    const ready = (listed.devices || []).filter(isSignalReady);
    if (ready.length === 0) return null;

    const needBundle: DeviceBundleItem[] = [];
    for (const d of ready) {
      if (await hasOpenSession(uid, d.device_id)) {
        all.push(toTarget(uid, d, false));
      } else {
        needBundle.push(d);
      }
    }

    if (needBundle.length === 0) continue;

    let bundle: Awaited<ReturnType<typeof getUserKeyBundle>>;
    try {
      bundle = await getUserKeyBundle(accessToken, uid);
    } catch {
      return null;
    }
    const byId = new Map((bundle.devices || []).map((d) => [d.device_id, d]));
    for (const d of needBundle) {
      const fromBundle = byId.get(d.device_id);
      if (!fromBundle || !isSignalReady(fromBundle)) return null;
      all.push(toTarget(uid, fromBundle, true));
    }
  }
  return all;
}
