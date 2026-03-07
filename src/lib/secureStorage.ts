/**
 * Secure storage for auth data and encryption keys.
 * Uses localStorage (works in browser and Next.js dev/build).
 * For native Capacitor builds you can switch to @capacitor/preferences.
 */

const AUTH_USER_KEY = "chatapp_user";
const AUTH_TOKENS_KEY = "chatapp_tokens";
const AUTH_KEYS_KEY = "chatapp_keys";
const AUTH_KEYS_PREFIX = "chatapp_keys_";

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
  const s = await getStorage();
  await s.set(AUTH_KEYS_PREFIX + userId, JSON.stringify(keys));
}

/** Load encryption keys for a user (e.g. after login). */
export async function getChatKeysForUser(userId: string): Promise<StoredChatKeys | null> {
  const s = await getStorage();
  const raw = await s.get(AUTH_KEYS_PREFIX + userId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredChatKeys;
  } catch {
    return null;
  }
}

/** Store current session keys (set at login from getChatKeysForUser). */
export async function setChatKeys(keys: StoredChatKeys | null): Promise<void> {
  const s = await getStorage();
  if (keys) await s.set(AUTH_KEYS_KEY, JSON.stringify(keys));
  else await s.remove(AUTH_KEYS_KEY);
}

export async function getChatKeys(): Promise<StoredChatKeys | null> {
  const s = await getStorage();
  const raw = await s.get(AUTH_KEYS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredChatKeys;
  } catch {
    return null;
  }
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
  await s.remove(AUTH_USER_KEY);
  await s.remove(AUTH_TOKENS_KEY);
  await s.remove(AUTH_KEYS_KEY);
}
