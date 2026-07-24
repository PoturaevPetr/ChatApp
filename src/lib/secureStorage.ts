/**
 * Auth session storage + chat key material.
 * User/tokens: localStorage (session convenience).
 * Chat private/public keys: cryptoSecureStorage (IndexedDB / Keychain) — never localStorage long-term.
 */

import {
  cryptoSecureDelete,
  cryptoSecureGet,
  cryptoSecureSet,
} from "@/lib/cryptoSecureStorage";

const AUTH_USER_KEY = "chatapp_user";
const AUTH_TOKENS_KEY = "chatapp_tokens";
/** Legacy localStorage keys — migrated on read, then removed. */
const LEGACY_AUTH_KEYS_KEY = "chatapp_keys";
const LEGACY_AUTH_KEYS_PREFIX = "chatapp_keys_";

const SECURE_SESSION_KEYS = "auth:session_chat_keys";
function secureUserKeysKey(userId: string): string {
  return `auth:chat_keys:${userId.trim().toLowerCase()}`;
}

export interface StoredUser {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface StoredAuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface StoredChatKeys {
  public_key: string;
  private_key: string;
}

function getStorage(): {
  set: (key: string, value: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
} {
  if (typeof window === "undefined") {
    return {
      set: async () => {},
      get: async () => null,
      remove: async () => {},
    };
  }
  return {
    set: async (key: string, value: string) => {
      localStorage.setItem(key, value);
    },
    get: async (key: string) => localStorage.getItem(key),
    remove: async (key: string) => localStorage.removeItem(key),
  };
}

function parseKeys(raw: string | null): StoredChatKeys | null {
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as StoredChatKeys;
    if (typeof k?.public_key === "string" && typeof k?.private_key === "string") return k;
    return null;
  } catch {
    return null;
  }
}

export async function setAuth(user: StoredUser | null): Promise<void> {
  const s = await getStorage();
  if (user) await s.set(AUTH_USER_KEY, JSON.stringify(user));
  else await s.remove(AUTH_USER_KEY);
}

export async function getAuth(): Promise<StoredUser | null> {
  const s = await getStorage();
  const raw = await s.get(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function setAuthTokens(tokens: StoredAuthTokens | null): Promise<void> {
  const s = await getStorage();
  if (tokens) await s.set(AUTH_TOKENS_KEY, JSON.stringify(tokens));
  else await s.remove(AUTH_TOKENS_KEY);
}

export async function getAuthTokens(): Promise<StoredAuthTokens | null> {
  const s = await getStorage();
  const raw = await s.get(AUTH_TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthTokens;
  } catch {
    return null;
  }
}

/** Store encryption keys for a specific user (e.g. after registration). */
export async function setChatKeysForUser(userId: string, keys: StoredChatKeys): Promise<void> {
  await cryptoSecureSet(secureUserKeysKey(userId), JSON.stringify(keys));
  const s = await getStorage();
  await s.remove(LEGACY_AUTH_KEYS_PREFIX + userId);
}

/** Load encryption keys for a user (e.g. after login). Migrates legacy localStorage. */
export async function getChatKeysForUser(userId: string): Promise<StoredChatKeys | null> {
  const fromSecure = parseKeys(await cryptoSecureGet(secureUserKeysKey(userId)));
  if (fromSecure) return fromSecure;

  const s = await getStorage();
  const legacy = parseKeys(await s.get(LEGACY_AUTH_KEYS_PREFIX + userId));
  if (legacy) {
    await cryptoSecureSet(secureUserKeysKey(userId), JSON.stringify(legacy));
    await s.remove(LEGACY_AUTH_KEYS_PREFIX + userId);
    return legacy;
  }
  return null;
}

/** Store current session keys (set at login from getChatKeysForUser). */
export async function setChatKeys(keys: StoredChatKeys | null): Promise<void> {
  const s = await getStorage();
  if (keys) {
    await cryptoSecureSet(SECURE_SESSION_KEYS, JSON.stringify(keys));
  } else {
    await cryptoSecureDelete(SECURE_SESSION_KEYS);
  }
  await s.remove(LEGACY_AUTH_KEYS_KEY);
}

export async function getChatKeys(): Promise<StoredChatKeys | null> {
  const fromSecure = parseKeys(await cryptoSecureGet(SECURE_SESSION_KEYS));
  if (fromSecure) return fromSecure;

  const s = await getStorage();
  const legacy = parseKeys(await s.get(LEGACY_AUTH_KEYS_KEY));
  if (legacy) {
    await cryptoSecureSet(SECURE_SESSION_KEYS, JSON.stringify(legacy));
    await s.remove(LEGACY_AUTH_KEYS_KEY);
    return legacy;
  }
  return null;
}

export async function setAuthWithTokens(
  user: StoredUser,
  tokens: StoredAuthTokens,
  keys?: StoredChatKeys | null
): Promise<void> {
  await setAuth(user);
  await setAuthTokens(tokens);
  if (keys) await setChatKeys(keys);
  else await setChatKeys(null);
}

export async function clearAuthData(): Promise<void> {
  const s = await getStorage();
  const userRaw = await s.get(AUTH_USER_KEY);
  await s.remove(AUTH_USER_KEY);
  await s.remove(AUTH_TOKENS_KEY);
  await s.remove(LEGACY_AUTH_KEYS_KEY);
  await cryptoSecureDelete(SECURE_SESSION_KEYS);
  if (userRaw) {
    try {
      const u = JSON.parse(userRaw) as StoredUser;
      if (u?.id) {
        await cryptoSecureDelete(secureUserKeysKey(u.id));
        await s.remove(LEGACY_AUTH_KEYS_PREFIX + u.id);
      }
    } catch {
      /* ignore */
    }
  }
}
