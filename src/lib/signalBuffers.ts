/**
 * ArrayBuffer ↔ base64 helpers for Signal Protocol wire/storage.
 */

export function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function b64ToAb(b64: string): ArrayBuffer {
  const normalized = b64.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

/** libsignal MessageType.body is a binary string */
export function binaryStringToB64(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i) & 0xff;
  return abToB64(bytes.buffer);
}

export function b64ToBinaryString(b64: string): string {
  const ab = b64ToAb(b64);
  const bytes = new Uint8Array(ab);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Stable SignalProtocolAddress.deviceId from our UUID device_id (1..2^31-2). */
export function signalDeviceIdFromUuid(deviceId: string): number {
  let h = 2166136261;
  for (let i = 0; i < deviceId.length; i += 1) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}
