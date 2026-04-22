"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const CACHE_VERSION = "v2";
const MAX_INLINE_FILE_DATA = 4096;

export interface ThreadMessagesDiskSnapshot {
  userId: string;
  threadId: string;
  roomId: string | null;
  messages: unknown[];
  activeChatNextOffset: number;
  activeChatHasMoreOlder: boolean;
  savedAt: number;
}

function isNative(): boolean {
  return typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
}

async function storageGet(key: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (isNative()) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }
  return localStorage.getItem(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNative()) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

async function storageRemove(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNative()) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}

function indexKey(userId: string): string {
  return `chatapp_thread_msgs_idx_${CACHE_VERSION}__${userId.trim().toLowerCase()}`;
}

function dataKey(userId: string, threadId: string): string {
  return `chatapp_thread_msgs_${CACHE_VERSION}__${userId.trim().toLowerCase()}__${encodeURIComponent(threadId)}`;
}

function stripLargeFileInContent(content: unknown): unknown {
  if (!content || typeof content !== "object") return content;
  const c = content as Record<string, unknown>;
  if (c.type !== "file") return content;
  const file = c.file;
  if (!file || typeof file !== "object") return content;
  const f = file as Record<string, unknown>;
  const data = f.data;
  if (typeof data === "string" && data.length > MAX_INLINE_FILE_DATA) {
    return {
      ...c,
      file: { ...f, data: "" },
    };
  }
  return content;
}

/** Убираем огромный base64 и незавершённые загрузки — для офлайн достаточно текста и file_ref. */
export function trimMessagesForDiskSnapshot(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => {
      if (!m || typeof m !== "object") return false;
      return (m as { isUploading?: boolean }).isUploading !== true;
    })
    .map((m) => {
      const msg = m as Record<string, unknown>;
      const content = stripLargeFileInContent(msg.content);
      const next: Record<string, unknown> = { ...msg, content };
      delete next.isUploading;
      delete next.uploadProgress;
      delete next.uploadError;
      return next;
    });
}

async function rememberThread(userId: string, threadId: string): Promise<void> {
  const key = indexKey(userId);
  let threads: string[] = [];
  try {
    const raw = await storageGet(key);
    if (raw) {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) threads = p.filter((t) => typeof t === "string");
    }
  } catch {
    threads = [];
  }
  if (!threads.includes(threadId)) {
    threads.push(threadId);
    await storageSet(key, JSON.stringify(threads));
  }
}

const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Сохранить снимок ленты для потока (расшифрованные сообщения уже в store).
 * @param immediate — без debounce (после полной загрузки с API).
 */
export function scheduleThreadMessagesCacheWrite(
  userId: string,
  threadId: string,
  snapshot: Omit<ThreadMessagesDiskSnapshot, "userId" | "threadId" | "savedAt">,
  immediate = false,
): void {
  if (typeof window === "undefined") return;
  const uid = userId.trim().toLowerCase();
  const tid = threadId;
  const debounceKey = `${uid}::${tid}`;

  const run = () => {
    void writeThreadMessagesCache(uid, tid, snapshot);
  };

  if (immediate) {
    const t = debouncers.get(debounceKey);
    if (t) clearTimeout(t);
    debouncers.delete(debounceKey);
    run();
    return;
  }

  const prev = debouncers.get(debounceKey);
  if (prev) clearTimeout(prev);
  debouncers.set(
    debounceKey,
    setTimeout(() => {
      debouncers.delete(debounceKey);
      run();
    }, 450),
  );
}

export async function readThreadMessagesCache(
  userId: string,
  threadId: string,
): Promise<ThreadMessagesDiskSnapshot | null> {
  try {
    const raw = await storageGet(dataKey(userId, threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThreadMessagesDiskSnapshot>;
    if (!parsed.userId || !parsed.threadId || !Array.isArray(parsed.messages)) return null;
    if (String(parsed.userId).toLowerCase() !== userId.trim().toLowerCase()) return null;
    if (String(parsed.threadId) !== threadId) return null;
    return {
      userId: String(parsed.userId).toLowerCase(),
      threadId: String(parsed.threadId),
      roomId:
        parsed.roomId === null || parsed.roomId === undefined
          ? null
          : typeof parsed.roomId === "string"
            ? parsed.roomId
            : null,
      messages: parsed.messages,
      activeChatNextOffset: typeof parsed.activeChatNextOffset === "number" ? parsed.activeChatNextOffset : 0,
      activeChatHasMoreOlder: parsed.activeChatHasMoreOlder === true,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

async function writeThreadMessagesCache(
  userId: string,
  threadId: string,
  snapshot: Omit<ThreadMessagesDiskSnapshot, "userId" | "threadId" | "savedAt">,
): Promise<void> {
  try {
    const uid = userId.trim().toLowerCase();
    const trimmed = trimMessagesForDiskSnapshot(snapshot.messages);
    const payload: ThreadMessagesDiskSnapshot = {
      userId: uid,
      threadId,
      roomId: snapshot.roomId,
      messages: trimmed,
      activeChatNextOffset: snapshot.activeChatNextOffset,
      activeChatHasMoreOlder: snapshot.activeChatHasMoreOlder,
      savedAt: Date.now(),
    };
    const str = JSON.stringify(payload);
    if (str.length > 4_500_000) return;
    await storageSet(dataKey(uid, threadId), str);
    await rememberThread(uid, threadId);
  } catch (e) {
    console.warn("[threadMessagesCache] write failed:", e);
  }
}

export async function clearThreadMessagesCacheForUser(userId: string): Promise<void> {
  const uid = userId.trim().toLowerCase();
  if (!uid) return;
  try {
    const raw = await storageGet(indexKey(uid));
    let threads: string[] = [];
    if (raw) {
      try {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p)) threads = p.filter((t) => typeof t === "string");
      } catch {
        threads = [];
      }
    }
    for (const tid of threads) {
      await storageRemove(dataKey(uid, tid));
    }
    await storageRemove(indexKey(uid));
  } catch {
    //
  }
}
