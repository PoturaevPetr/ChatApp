const AUTH_KEY = "chatapp_user";
const AUTH_TOKENS_KEY = "chatapp_tokens";
const AUTH_KEYS_KEY = "chatapp_keys";
const USERS_KEY = "chatapp_users";
const MESSAGES_KEY = "chatapp_messages";

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

export type StoredMessageContent =
  | { type: "text"; text: string; reply_to?: { id: string; preview: string } }
  | { type: "file"; text?: string; file: { name: string; mimeType: string; data: string }; reply_to?: { id: string; preview: string } };

export interface StoredMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: StoredMessageContent;
  timestamp: string;
  status: "sent" | "delivered" | "read";
}

function getAuth(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setAuth(user: StoredUser | null): void {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
}

export function setAuthWithTokens(
  user: StoredUser,
  tokens: StoredAuthTokens,
  keys?: StoredChatKeys | null
): void {
  if (typeof window === "undefined") return;
  setAuth(user);
  setAuthTokens(tokens);
  if (keys) setChatKeys(keys);
  else setChatKeys(null);
}

export function getAuthSync(): StoredUser | null {
  return getAuth();
}

export function setAuthTokens(tokens: StoredAuthTokens | null): void {
  if (typeof window === "undefined") return;
  if (tokens) localStorage.setItem(AUTH_TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(AUTH_TOKENS_KEY);
}

export function getAuthTokens(): StoredAuthTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredAuthTokens) : null;
  } catch {
    return null;
  }
}

export function setChatKeys(keys: StoredChatKeys | null): void {
  if (typeof window === "undefined") return;
  if (keys) localStorage.setItem(AUTH_KEYS_KEY, JSON.stringify(keys));
  else localStorage.removeItem(AUTH_KEYS_KEY);
}

export function getChatKeys(): StoredChatKeys | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEYS_KEY);
    return raw ? (JSON.parse(raw) as StoredChatKeys) : null;
  } catch {
    return null;
  }
}

export function clearAuthData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_TOKENS_KEY);
  localStorage.removeItem(AUTH_KEYS_KEY);
}

function threadKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function getStoredMessages(): StoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as StoredMessage[]) : [];
  } catch {
    return [];
  }
}

export function appendMessage(msg: Omit<StoredMessage, "id" | "timestamp" | "status">): StoredMessage {
  const messages = getStoredMessages();
  const newMsg: StoredMessage = {
    ...msg,
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    status: "sent",
  };
  messages.push(newMsg);
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  return newMsg;
}

export function getMessagesForThread(userId1: string, userId2: string): StoredMessage[] {
  const key = threadKey(userId1, userId2);
  return getStoredMessages().filter((m) => threadKey(m.senderId, m.recipientId) === key);
}

export function markThreadAsRead(userId1: string, userId2: string): void {
  const messages = getStoredMessages();
  const key = threadKey(userId1, userId2);
  let changed = false;
  const updated = messages.map((m) => {
    if (threadKey(m.senderId, m.recipientId) === key && m.status !== "read") {
      changed = true;
      return { ...m, status: "read" as const };
    }
    return m;
  });
  if (changed) localStorage.setItem(MESSAGES_KEY, JSON.stringify(updated));
}

export function getDemoUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw) as StoredUser[];
  } catch {
    // ignore
  }
  const defaultUsers: StoredUser[] = [
    { id: "user_1", name: "Алексей" },
    { id: "user_2", name: "Мария" },
    { id: "user_3", name: "Иван" },
  ];
  localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
  return defaultUsers;
}

export function addDemoUser(user: StoredUser): void {
  const users = getDemoUsers();
  if (users.some((u) => u.id === user.id)) return;
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
