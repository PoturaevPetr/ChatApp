/**
 * SignalProtocol StorageType backed by cryptoSecureStorage.
 * CRYPTO_DEVICES_V3 — @privacyresearch/libsignal-protocol-typescript
 */

import {
  Direction,
  SignalProtocolAddress,
  type KeyPairType,
  type SessionRecordType,
  type StorageType,
} from "@privacyresearch/libsignal-protocol-typescript";
import { cryptoSecureDelete, cryptoSecureGet, cryptoSecureSet } from "@/lib/cryptoSecureStorage";
import { abToB64, b64ToAb } from "@/lib/signalBuffers";

const PREFIX = "signal:store:";

function sk(key: string): string {
  return PREFIX + key;
}

function isKeyPair(v: unknown): v is KeyPairType {
  return (
    !!v &&
    typeof v === "object" &&
    "pubKey" in v &&
    "privKey" in v &&
    (v as KeyPairType).pubKey instanceof ArrayBuffer &&
    (v as KeyPairType).privKey instanceof ArrayBuffer
  );
}

type SerializedKp = { pubKey: string; privKey: string };

function serializeValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return JSON.stringify({ t: typeof value, v: value });
  }
  if (value instanceof ArrayBuffer) {
    return JSON.stringify({ t: "ab", v: abToB64(value) });
  }
  if (isKeyPair(value)) {
    const kp: SerializedKp = { pubKey: abToB64(value.pubKey), privKey: abToB64(value.privKey) };
    return JSON.stringify({ t: "kp", v: kp });
  }
  throw new Error("Unsupported store value type");
}

function deserializeValue(raw: string): unknown {
  const parsed = JSON.parse(raw) as { t: string; v: unknown };
  if (parsed.t === "string" || parsed.t === "number") return parsed.v;
  if (parsed.t === "ab" && typeof parsed.v === "string") return b64ToAb(parsed.v);
  if (parsed.t === "kp" && parsed.v && typeof parsed.v === "object") {
    const kp = parsed.v as SerializedKp;
    return { pubKey: b64ToAb(kp.pubKey), privKey: b64ToAb(kp.privKey) } as KeyPairType;
  }
  throw new Error("Corrupt store value");
}

async function put(key: string, value: unknown): Promise<void> {
  await cryptoSecureSet(sk(key), serializeValue(value));
}

async function get(key: string): Promise<unknown | undefined> {
  const raw = await cryptoSecureGet(sk(key));
  if (raw == null) return undefined;
  return deserializeValue(raw);
}

async function remove(key: string): Promise<void> {
  await cryptoSecureDelete(sk(key));
}

export class SecureSignalProtocolStore implements StorageType {
  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const kp = await get("identityKey");
    if (kp === undefined) return undefined;
    if (isKeyPair(kp)) return kp;
    throw new Error("identityKey wrong type");
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const rid = await get("registrationId");
    if (rid === undefined) return undefined;
    if (typeof rid === "number") return rid;
    throw new Error("registrationId wrong type");
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    if (!identifier) throw new Error("null identity identifier");
    const trusted = await get("identityKey" + identifier);
    if (trusted === undefined) return true;
    if (!(trusted instanceof ArrayBuffer)) throw new Error("trusted identity wrong type");
    return abToB64(identityKey) === abToB64(trusted);
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    if (!identifier) throw new Error("null identity identifier");
    const address = SignalProtocolAddress.fromString(identifier);
    const existing = await get("identityKey" + address.getName());
    await put("identityKey" + address.getName(), identityKey);
    if (existing && !(existing instanceof ArrayBuffer)) {
      throw new Error("Identity Key is incorrect type");
    }
    if (existing && abToB64(identityKey) !== abToB64(existing as ArrayBuffer)) {
      return true;
    }
    return false;
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const res = await get("25519KeypreKey" + keyId);
    if (res === undefined) return undefined;
    if (isKeyPair(res)) return { pubKey: res.pubKey, privKey: res.privKey };
    throw new Error("preKey wrong type");
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await put("25519KeypreKey" + keyId, keyPair);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await remove("25519KeypreKey" + keyId);
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const res = await get("25519KeysignedKey" + keyId);
    if (res === undefined) return undefined;
    if (isKeyPair(res)) return { pubKey: res.pubKey, privKey: res.privKey };
    throw new Error("signedPreKey wrong type");
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await put("25519KeysignedKey" + keyId, keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await remove("25519KeysignedKey" + keyId);
  }

  async loadSession(identifier: string): Promise<SessionRecordType | undefined> {
    const rec = await get("session" + identifier);
    if (rec === undefined) return undefined;
    if (typeof rec === "string") return rec;
    throw new Error("session wrong type");
  }

  async storeSession(identifier: string, record: SessionRecordType): Promise<void> {
    await put("session" + identifier, record);
  }
}

let singleton: SecureSignalProtocolStore | null = null;

export function getSignalStore(): SecureSignalProtocolStore {
  if (!singleton) singleton = new SecureSignalProtocolStore();
  return singleton;
}

/** Persist local identity + registration into the store (idempotent helpers). */
export async function putLocalIdentity(
  identityKeyPair: KeyPairType,
  registrationId: number
): Promise<void> {
  await put("identityKey", identityKeyPair);
  await put("registrationId", registrationId);
}
