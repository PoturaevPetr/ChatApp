/**
 * Общий кэш object URL для превью/полных вложений (E2E).
 * Несколько экземпляров RemoteFileAttachment (лента + оверлей меню) делят один URL без повторной загрузки.
 */

type Entry = { url: string; refs: number };

const store = new Map<string, Entry>();

export function previewAttachmentCacheKey(previewId: string, keyKind: "thumb" | "full"): string {
  return `pv:${previewId}:${keyKind}`;
}

export function fullImageAttachmentCacheKey(fullAttachmentId: string): string {
  return `fu:${fullAttachmentId}`;
}

/** Взять URL из кэша и увеличить счётчик удержания. */
export function takeCachedBlobUrl(key: string): string | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  e.refs += 1;
  return e.url;
}

/**
 * Зарегистрировать свежий object URL. Если ключ уже есть — дубликат отзывается, счётчик увеличивается.
 */
export function registerBlobUrl(key: string, freshUrl: string): string {
  const existing = store.get(key);
  if (existing) {
    URL.revokeObjectURL(freshUrl);
    existing.refs += 1;
    return existing.url;
  }
  store.set(key, { url: freshUrl, refs: 1 });
  return freshUrl;
}

export function releaseBlobUrl(key: string, url: string): void {
  const e = store.get(key);
  if (!e || e.url !== url) return;
  e.refs -= 1;
  if (e.refs <= 0) {
    URL.revokeObjectURL(e.url);
    store.delete(key);
  }
}

export function clearAttachmentMediaCache(): void {
  for (const e of store.values()) {
    URL.revokeObjectURL(e.url);
  }
  store.clear();
}
