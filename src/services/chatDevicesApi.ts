/**
 * Devices API — CRYPTO_DEVICES_V3
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface DeviceRegisterBody {
  device_id: string;
  name?: string;
  platform: string;
  identity_key_public: string;
  /** Curve25519 identity public (base64) for signal_v1 */
  signal_identity_key_public?: string;
  registration_id: number;
  signed_prekey_id?: number;
  signed_prekey_public?: string;
  signed_prekey_signature?: string;
  one_time_prekeys?: { key_id: number; public_key: string }[];
}

export interface DeviceInfo {
  id: string;
  device_id: string;
  name?: string | null;
  platform: string;
  identity_key_public: string;
  signal_identity_key_public?: string | null;
  registration_id: number;
  is_active: boolean;
  unused_otpk_count?: number;
  linked_at?: string | null;
}

export interface DeviceBundleItem {
  device_id: string;
  identity_key_public: string;
  signal_identity_key_public?: string | null;
  registration_id: number;
  signed_prekey_id?: number | null;
  signed_prekey_public?: string | null;
  signed_prekey_signature?: string | null;
  one_time_prekey?: { key_id: number; public_key: string } | null;
}

export interface UserKeyBundle {
  user_id: string;
  devices: DeviceBundleItem[];
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof (data as { detail?: string }).detail === "string"
    ? (data as { detail: string }).detail
    : res.statusText;
}

export async function registerDevice(
  accessToken: string,
  body: DeviceRegisterBody
): Promise<DeviceInfo> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as DeviceInfo;
}

export async function listMyDevices(accessToken: string): Promise<DeviceInfo[]> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/me`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as DeviceInfo[];
}

export async function listUserDevices(
  accessToken: string,
  userId: string
): Promise<UserKeyBundle> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/users/${encodeURIComponent(userId)}/devices`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as UserKeyBundle;
}

export async function getUserKeyBundle(
  accessToken: string,
  userId: string
): Promise<UserKeyBundle> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/users/${encodeURIComponent(userId)}/key-bundle`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as UserKeyBundle;
}

export async function replenishPrekeys(
  accessToken: string,
  deviceId: string,
  oneTimePrekeys: { key_id: number; public_key: string }[]
): Promise<void> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/me/prekeys`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId, one_time_prekeys: oneTimePrekeys }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

/** If server unused OTP below threshold — generate + upload batch. */
export async function maybeReplenishPrekeys(accessToken: string): Promise<void> {
  const { getOrCreateLocalDeviceId } = await import("@/lib/deviceIdentity");
  const { generateOneTimePrekeysForUpload, OTP_REPLENISH_THRESHOLD } = await import(
    "@/lib/signalIdentity"
  );
  const deviceId = await getOrCreateLocalDeviceId();
  const mine = await listMyDevices(accessToken);
  const row = mine.find((d) => d.device_id === deviceId);
  const unused = row?.unused_otpk_count ?? 0;
  if (unused >= OTP_REPLENISH_THRESHOLD) return;
  const batch = await generateOneTimePrekeysForUpload();
  await replenishPrekeys(accessToken, deviceId, batch);
}

export interface LinkStartResponse {
  link_id: string;
  code: string;
  expires_at: string;
  /** Payload for QR: kindred-link:<code> */
  qr_payload: string;
}

export async function startDeviceLink(accessToken: string): Promise<LinkStartResponse> {
  const { getOrCreateLocalDeviceId } = await import("@/lib/deviceIdentity");
  const deviceId = await getOrCreateLocalDeviceId();
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/link/start`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as LinkStartResponse;
}

export async function finishDeviceLink(
  accessToken: string,
  code: string
): Promise<{ device_id: string; linked: boolean }> {
  const { getOrCreateLocalDeviceId } = await import("@/lib/deviceIdentity");
  const deviceId = await getOrCreateLocalDeviceId();
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/link/finish`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: code.trim(), device_id: deviceId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { device_id: string; linked: boolean };
}

export async function revokeDevice(accessToken: string, deviceId: string): Promise<void> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) throw new Error(await parseError(res));
}

/**
 * После login/register/oauth: локальная identity → POST /devices/register.
 * RSA (hybrid) + Signal Curve25519 prekeys.
 */
export async function approveDeviceLogin(
  accessToken: string,
  code: string,
): Promise<{ approved: boolean; login_device_id: string }> {
  const { getOrCreateLocalDeviceId } = await import("@/lib/deviceIdentity");
  const deviceId = await getOrCreateLocalDeviceId();
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/devices/link/approve-login`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, device_id: deviceId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { approved: boolean; login_device_id: string };
}

export async function ensureDeviceRegistered(accessToken: string): Promise<LocalDeviceResult> {
  const { getOrCreateLocalDeviceIdentity, guessDevicePlatform, defaultDeviceName } = await import(
    "@/lib/deviceIdentity"
  );
  const { ensureSignalIdentity } = await import("@/lib/signalIdentity");
  const identity = await getOrCreateLocalDeviceIdentity();
  const signal = await ensureSignalIdentity();

  const device = await registerDevice(accessToken, {
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
  });

  try {
    await maybeReplenishPrekeys(accessToken);
  } catch {
    /* best-effort */
  }

  const { setChatKeys } = await import("@/lib/secureStorage");
  await setChatKeys({
    public_key: identity.publicKeyPem,
    private_key: identity.privateKeyPem,
  });

  return { identity, device };
}

export type LocalDeviceResult = {
  identity: {
    deviceId: string;
    publicKeyPem: string;
    privateKeyPem: string;
    registrationId: number;
  };
  device: DeviceInfo;
};
