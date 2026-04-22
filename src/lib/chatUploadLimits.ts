/** Максимальный размер вложения для чата (клиент + сервер attachments). */
export const MAX_CHAT_ATTACHMENT_BYTES = 200 * 1024 * 1024;

export function maxAttachmentSizeLabelMb(): number {
  return MAX_CHAT_ATTACHMENT_BYTES / 1024 / 1024;
}

/** Примерный размер бинарных данных из base64-payload (без padding). */
export function approxBytesFromBase64Payload(b64: string): number {
  if (!b64) return 0;
  const len = b64.replace(/\s/g, "").length;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export function alertFileTooLarge(fileName: string): void {
  window.alert(
    `Файл «${fileName}» слишком большой. Максимальный размер — ${maxAttachmentSizeLabelMb()} МБ.`,
  );
}
