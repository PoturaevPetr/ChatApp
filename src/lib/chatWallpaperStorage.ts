"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  DEFAULT_CHAT_WALLPAPER_PRESET_ID,
  type ChatWallpaperSelection,
} from "@/lib/chatWallpapers";

const META_VERSION = "v1";
const CUSTOM_DB = "chatapp_wallpaper_custom";
const CUSTOM_STORE = "images";

export type ChatWallpaperScope = "room" | "global";

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

function metaKey(scope: ChatWallpaperScope, roomId: string | null): string {
  if (scope === "global") return `chatapp_wallpaper_${META_VERSION}__global`;
  return `chatapp_wallpaper_${META_VERSION}__room__${encodeURIComponent(roomId ?? "")}`;
}

function customStorageKey(scope: ChatWallpaperScope, roomId: string | null): string {
  if (scope === "global") return "global";
  return `room:${roomId ?? ""}`;
}

function openCustomDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CUSTOM_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_STORE)) {
        db.createObjectStore(CUSTOM_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openCustomDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE, "readonly");
      const req = tx.objectStore(CUSTOM_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, dataUrl: string): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB недоступен");
  const db = await openCustomDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CUSTOM_STORE, "readwrite");
    tx.objectStore(CUSTOM_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openCustomDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE, "readwrite");
      tx.objectStore(CUSTOM_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function readWallpaperSelection(
  scope: ChatWallpaperScope,
  roomId: string | null,
): Promise<ChatWallpaperSelection> {
  try {
    const raw = await storageGet(metaKey(scope, roomId));
    if (!raw) {
      return { kind: "preset", presetId: DEFAULT_CHAT_WALLPAPER_PRESET_ID };
    }
    const parsed = JSON.parse(raw) as Partial<ChatWallpaperSelection>;
    if (parsed.kind === "custom" && typeof parsed.storageKey === "string") {
      return { kind: "custom", storageKey: parsed.storageKey };
    }
    if (parsed.kind === "preset" && typeof (parsed as { presetId?: string }).presetId === "string") {
      return { kind: "preset", presetId: (parsed as { presetId: string }).presetId };
    }
  } catch {
    /* ignore */
  }
  return { kind: "preset", presetId: DEFAULT_CHAT_WALLPAPER_PRESET_ID };
}

export async function writeWallpaperPreset(
  scope: ChatWallpaperScope,
  roomId: string | null,
  presetId: string,
): Promise<void> {
  await storageSet(
    metaKey(scope, roomId),
    JSON.stringify({ kind: "preset", presetId }),
  );
}

export async function writeWallpaperCustom(
  scope: ChatWallpaperScope,
  roomId: string | null,
  dataUrl: string,
): Promise<ChatWallpaperSelection> {
  const key = customStorageKey(scope, roomId);
  await idbSet(key, dataUrl);
  const selection: ChatWallpaperSelection = { kind: "custom", storageKey: key };
  await storageSet(metaKey(scope, roomId), JSON.stringify(selection));
  return selection;
}

export async function readCustomWallpaperUrl(storageKey: string): Promise<string | null> {
  return idbGet(storageKey);
}

export async function resetWallpaper(scope: ChatWallpaperScope, roomId: string | null): Promise<void> {
  const key = customStorageKey(scope, roomId);
  await idbDelete(key);
  await storageRemove(metaKey(scope, roomId));
}

/** Сначала фон комнаты, иначе глобальный, иначе дефолтный пресет. */
export async function resolveEffectiveWallpaper(roomId: string | null): Promise<{
  selection: ChatWallpaperSelection;
  customUrl: string | null;
}> {
  let selection = await readWallpaperSelection("room", roomId);
  if (roomId) {
    const roomRaw = await storageGet(metaKey("room", roomId));
    if (!roomRaw) {
      selection = await readWallpaperSelection("global", null);
    }
  } else {
    selection = await readWallpaperSelection("global", null);
  }
  let customUrl: string | null = null;
  if (selection.kind === "custom") {
    customUrl = await readCustomWallpaperUrl(selection.storageKey);
    if (!customUrl) {
      selection = { kind: "preset", presetId: DEFAULT_CHAT_WALLPAPER_PRESET_ID };
    }
  }
  return { selection, customUrl };
}

export async function resizeImageFileToDataUrl(file: File, maxSide = 1200, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
