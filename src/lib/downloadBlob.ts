/** Символы, недопустимые в имени файла Windows / в атрибуте download. */
const INVALID_DOWNLOAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Имя для атрибута `download` и для `new File(..., name)`: убираем запрещённые символы,
 * сохраняем кириллицу и прочий Unicode (Chrome/Firefox/Safari на blob-URL).
 */
export function sanitizeDownloadFileName(name: string): string {
  const n = (name || "").trim() || "file";
  return n.replace(INVALID_DOWNLOAD_CHARS, "_").replace(/\s+$/, "").slice(0, 240) || "file";
}

/**
 * Сохранение Blob на диск с заданным именем (в т.ч. кириллица).
 * Оборачиваем в `File`, чтобы движок подставлял корректное suggested filename.
 */
export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const safeName = sanitizeDownloadFileName(filename);
  const mime = blob.type || "application/octet-stream";
  const file = new File([blob], safeName, { type: mime });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
