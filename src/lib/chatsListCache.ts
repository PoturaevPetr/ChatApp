"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const CACHE_KEY = "chatapp_chats_list_cache_v1";
/** Не кладём в JSON огромный base64 вложений — превью в списке не нужно тело файла. */
const MAX_INLINE_FILE_DATA = 4096;

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

function stripLargeFilePayloads(chats: unknown): unknown {
  if (!Array.isArray(chats)) return chats;
  return chats.map((chat) => {
    if (!chat || typeof chat !== "object") return chat;
    const c = chat as Record<string, unknown>;
    const lm = c.lastMessage;
    if (!lm || typeof lm !== "object") return chat;
    const msg = lm as Record<string, unknown>;
    const content = msg.content;
    if (!content || typeof content !== "object") return chat;
    const co = content as Record<string, unknown>;
    if (co.type !== "file") return chat;
    const file = co.file;
    if (!file || typeof file !== "object") return chat;
    const f = file as Record<string, unknown>;
    const data = f.data;
    if (typeof data !== "string" || data.length <= MAX_INLINE_FILE_DATA) return chat;
    return {
      ...c,
      lastMessage: {
        ...msg,
        content: {
          ...co,
          file: { ...f, data: "" },
        },
      },
    };
  });
}

/**
 * Снимок списка чатов для cold start: сначала показать с диска, затем подменить ответом API.
 */
export async function readChatsListCache(userId: string): Promise<unknown[] | null> {
  try {
    const raw = await storageGet(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; chats?: unknown };
    if (!parsed.userId || !Array.isArray(parsed.chats)) return null;
    if (String(parsed.userId).toLowerCase() !== userId.trim().toLowerCase()) return null;
    return parsed.chats;
  } catch {
    return null;
  }
}

export async function writeChatsListCache(userId: string, chats: unknown[]): Promise<void> {
  try {
    const trimmed = stripLargeFilePayloads(chats) as unknown[];
    const payload = JSON.stringify({
      userId: userId.trim().toLowerCase(),
      chats: trimmed,
      savedAt: Date.now(),
    });
    if (payload.length > 4_500_000) return;
    await storageSet(CACHE_KEY, payload);
  } catch (e) {
    console.warn("[chatsListCache] write failed:", e);
  }
}

export async function clearChatsListCache(): Promise<void> {
  try {
    await storageRemove(CACHE_KEY);
  } catch {
    //
  }
}
