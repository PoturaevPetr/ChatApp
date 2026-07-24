/**
 * Secure storage for crypto secrets (CRYPTO_DEVICES_V3).
 * Native: KindredNative.secure* → Keychain/Keystore.
 * Web: IndexedDB (not localStorage).
 * Never store private keys in localStorage.
 */

import { getKindredNativeInfo, hasNativeCapability } from "@/lib/kindredNativeBridge";

const DB_NAME = "kindred_crypto_secure";
const STORE = "kv";
const DB_VERSION = 1;

type NativeSecure = {
  secureSet?: (key: string, value: string) => Promise<void>;
  secureGet?: (key: string) => Promise<string | null>;
  secureDelete?: (key: string) => Promise<void>;
};

function nativeSecure(): NativeSecure | null {
  if (typeof window === "undefined") return null;
  if (!hasNativeCapability("secure_storage")) return null;
  const n = window.KindredNative as (typeof window.KindredNative & NativeSecure) | undefined;
  if (n?.secureGet && n?.secureSet) return n;
  return null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb set failed"));
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("idb get failed"));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"));
  });
}

export async function cryptoSecureSet(key: string, value: string): Promise<void> {
  const n = nativeSecure();
  if (n?.secureSet) {
    await n.secureSet(key, value);
    return;
  }
  if (typeof indexedDB === "undefined") {
    throw new Error("Secure storage unavailable");
  }
  await idbSet(key, value);
}

export async function cryptoSecureGet(key: string): Promise<string | null> {
  const n = nativeSecure();
  if (n?.secureGet) {
    return n.secureGet(key);
  }
  if (typeof indexedDB === "undefined") return null;
  return idbGet(key);
}

export async function cryptoSecureDelete(key: string): Promise<void> {
  const n = nativeSecure();
  if (n?.secureDelete) {
    await n.secureDelete(key);
    return;
  }
  if (typeof indexedDB === "undefined") return;
  await idbDelete(key);
}

export function cryptoSecureBackend(): "native" | "indexeddb" | "none" {
  if (nativeSecure()?.secureGet) return "native";
  if (typeof indexedDB !== "undefined") return "indexeddb";
  return "none";
}

/** Namespace helpers for device crypto material */
export function deviceCryptoKey(deviceId: string, kind: string): string {
  return `crypto:device:${deviceId}:${kind}`;
}

export function getSecureStoragePlatformHint(): string {
  const info = getKindredNativeInfo();
  return info?.platform ?? "web";
}
