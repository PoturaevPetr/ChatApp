/** Определение типа вложения и нормализация MIME для blob URL / UI. */

export function normalizeMediaMimeType(mimeType: string, fileName?: string): string {
  const raw = (mimeType || "").trim();
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.startsWith("video/") || base.startsWith("audio/") || base.startsWith("image/")) {
    return base;
  }
  const name = (fileName || "").trim().toLowerCase();
  if (/\.webm$/.test(name)) {
    return name.startsWith("audio-") ? "audio/webm" : "video/webm";
  }
  if (/\.(mp4|m4v|mov)$/.test(name)) {
    return name.startsWith("audio-") ? "audio/mp4" : "video/mp4";
  }
  if (/\.(ogg|opus|mp3|wav|m4a|aac|flac|amr)$/.test(name)) return "audio/mpeg";
  if (/\.(jpe?g|png|gif|webp|bmp)$/.test(name)) return "image/jpeg";
  return base || "application/octet-stream";
}

export function isVideoAttachment(mimeType: string, fileName?: string): boolean {
  const m = normalizeMediaMimeType(mimeType, fileName);
  if (m.startsWith("video/")) return true;
  const name = (fileName || "").toLowerCase();
  return /\.(mp4|mov|m4v|mkv)$/.test(name) || (/\.webm$/.test(name) && !name.startsWith("audio-"));
}

export function isAudioAttachment(mimeType: string, fileName?: string): boolean {
  const m = normalizeMediaMimeType(mimeType, fileName);
  if (m.startsWith("audio/")) return true;
  const name = (fileName || "").toLowerCase();
  return /\.(ogg|opus|mp3|wav|m4a|aac|flac|amr)$/.test(name) || (name.startsWith("audio-") && /\.webm$/.test(name));
}

export function isImageAttachment(mimeType: string, fileName?: string): boolean {
  const m = normalizeMediaMimeType(mimeType, fileName);
  if (m.startsWith("image/")) return true;
  const name = (fileName || "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(name);
}
