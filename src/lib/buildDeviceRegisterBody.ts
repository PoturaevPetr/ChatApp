/** Shared device registration payload for ChatService devices API. */

import {
  getOrCreateLocalDeviceIdentity,
  guessDevicePlatform,
  defaultDeviceName,
} from "@/lib/deviceIdentity";
import { ensureSignalIdentity } from "@/lib/signalIdentity";
import type { DeviceRegisterBody } from "@/services/chatDevicesApi";

export async function buildDeviceRegisterBody(): Promise<DeviceRegisterBody> {
  const identity = await getOrCreateLocalDeviceIdentity();
  const signal = await ensureSignalIdentity();
  return {
    device_id: identity.deviceId,
    name: defaultDeviceName(),
    platform: guessDevicePlatform(),
    identity_key_public: identity.publicKeyPem,
    signal_identity_key_public: signal.identityKeyPublicB64,
    registration_id: signal.registrationId,
    signed_prekey_id: signal.signedPrekeyId,
    signed_prekey_public: signal.signedPrekeyPublicB64,
    signed_prekey_signature: signal.signedPrekeySignatureB64,
    one_time_prekeys: signal.oneTimePrekeys,
  };
}
