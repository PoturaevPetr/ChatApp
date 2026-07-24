/**
 * Message crypto envelopes — CRYPTO_DEVICES_V3
 *
 * Send: signal_v1 (1:1), sender_key_v0 (groups).
 * Receive may still decrypt legacy_user_e2e / hybrid_device_v0.
 */

export type CryptoProtocol =
  | "legacy_user_e2e"
  | "hybrid_device_v0"
  | "signal_v1"
  | "sender_key_v0";

export interface DeviceEnvelope {
  device_id: string;
  type: "prekey" | "message" | "hybrid_rsa" | "skdm" | "sender_key";
  body_b64: string;
  user_id?: string;
}

export interface MultiDeviceE2EPayload {
  protocol: CryptoProtocol;
  encrypted_data: string;
  nonce: string;
  envelopes: DeviceEnvelope[];
  /** Access gate / legacy readers — one wrap per user (first device) */
  recipient_keys: Array<{ user_id: string; encrypted_aes_key: string }>;
  signature?: string | null;
}

/** Prefer Signal for 1:1; groups use sender_key_v0 when possible. */
export const CURRENT_SEND_PROTOCOL: CryptoProtocol = "signal_v1";
