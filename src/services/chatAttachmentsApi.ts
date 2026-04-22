/**
 * Загрузка вложений по REST (вне тела зашифрованного сообщения).
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface UploadAttachmentsResult {
  attachment_id: string;
  thumbnail_attachment_id: string | null;
}

export async function uploadRoomAttachments(
  accessToken: string,
  roomId: string,
  file: Blob,
  fileName: string,
  mimeType: string,
  thumbnail: Blob | null,
  thumbFileName = "thumb.jpg",
  onUploadProgress?: (percent0to100: number) => void,
): Promise<UploadAttachmentsResult> {
  const form = new FormData();
  form.append("file", new File([file], fileName, { type: mimeType }));
  if (thumbnail) {
    form.append("thumbnail", new File([thumbnail], thumbFileName, { type: "image/jpeg" }));
  }
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/rooms/${encodeURIComponent(roomId)}/attachments`;

  return new Promise<UploadAttachmentsResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => {
      if (!onUploadProgress) return;
      if (ev.lengthComputable && ev.total > 0) {
        onUploadProgress(Math.min(100, Math.max(0, Math.round((100 * ev.loaded) / ev.total))));
      }
    };
    xhr.onload = () => {
      let raw: unknown = xhr.response;
      if (raw == null && xhr.responseText) {
        try {
          raw = JSON.parse(xhr.responseText);
        } catch {
          raw = {};
        }
      }
      const data = (typeof raw === "object" && raw ? raw : {}) as {
        attachment_id?: string;
        thumbnail_attachment_id?: string | null;
        detail?: string;
      };
      if (xhr.status >= 200 && xhr.status < 300 && data.attachment_id) {
        resolve({
          attachment_id: data.attachment_id,
          thumbnail_attachment_id: data.thumbnail_attachment_id ?? null,
        });
        return;
      }
      const detail = typeof data.detail === "string" ? data.detail : `Upload failed (${xhr.status})`;
      reject(new Error(detail));
    };
    xhr.onerror = () => reject(new Error("Сеть: не удалось загрузить файл"));
    xhr.onabort = () => reject(new Error("Загрузка отменена"));
    xhr.send(form);
  });
}

export async function fetchAttachmentBlob(
  accessToken: string,
  attachmentId: string,
  onDownloadProgress?: (percent0to100: number) => void,
): Promise<Blob> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/attachments/${encodeURIComponent(attachmentId)}`;

  if (!onDownloadProgress) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `Download failed (${res.status})`);
    }
    return res.blob();
  }

  return new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.responseType = "blob";
    let lastReported = -1;
    xhr.onprogress = (ev) => {
      if (!ev.lengthComputable || ev.total <= 0) {
        if (ev.loaded > 0 && lastReported < 0) {
          lastReported = 0;
          onDownloadProgress(0);
        }
        return;
      }
      const pct = Math.min(98, Math.max(0, Math.round((100 * ev.loaded) / ev.total)));
      if (pct !== lastReported) {
        lastReported = pct;
        onDownloadProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = xhr.response as Blob;
        if (body == null) {
          reject(new Error("Пустой ответ при скачивании"));
          return;
        }
        onDownloadProgress(99);
        resolve(body);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const t = typeof reader.result === "string" ? reader.result : xhr.statusText;
        reject(new Error(t || `Download failed (${xhr.status})`));
      };
      reader.onerror = () => reject(new Error(`Download failed (${xhr.status})`));
      reader.readAsText(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error("Сеть: не удалось скачать файл"));
    xhr.onabort = () => reject(new Error("Скачивание отменено"));
    xhr.send();
  });
}

export type AttachmentTranscriptionStatus = "done" | "pending" | "failed" | "none";

export interface AttachmentTranscriptionResponse {
  status: AttachmentTranscriptionStatus;
  text?: string | null;
  error?: string | null;
}

/** Сервис иногда отдаёт одну фразу дважды через \\n — схлопываем. */
function normalizeDuplicateTranscriptionLines(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = text.trim();
  if (!t) return null;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length >= 2 && lines.every((l) => l === lines[0])) return lines[0];
  return t;
}

function withNormalizedTranscriptionText(
  r: AttachmentTranscriptionResponse
): AttachmentTranscriptionResponse {
  if (r.status !== "done") return r;
  return { ...r, text: normalizeDuplicateTranscriptionLines(r.text) };
}

const TRANSCRIPTION_CACHE_TTL_MS = 120_000;
const transcriptionCache = new Map<string, { expires: number; data: AttachmentTranscriptionResponse }>();

export function invalidateAttachmentTranscriptionCache(attachmentId: string): void {
  transcriptionCache.delete(attachmentId);
}

export async function getAttachmentTranscription(
  accessToken: string,
  attachmentId: string,
  options?: { bypassCache?: boolean }
): Promise<AttachmentTranscriptionResponse> {
  if (!options?.bypassCache) {
    const hit = transcriptionCache.get(attachmentId);
    if (
      hit &&
      hit.expires > Date.now() &&
      (hit.data.status === "done" || hit.data.status === "failed")
    ) {
      return withNormalizedTranscriptionText(hit.data);
    }
  }

  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/attachments/${encodeURIComponent(attachmentId)}/transcription`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => ({}))) as AttachmentTranscriptionResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Transcription status failed (${res.status})`);
  }
  const normalized = withNormalizedTranscriptionText({
    status: data.status,
    text: data.text ?? null,
    error: data.error ?? null,
  });
  if (normalized.status === "done" || normalized.status === "failed") {
    transcriptionCache.set(attachmentId, {
      expires: Date.now() + TRANSCRIPTION_CACHE_TTL_MS,
      data: normalized,
    });
  }
  return normalized;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Запуск распознавания (multipart: расшифрованное аудио). Дальше — polling через getAttachmentTranscription. */
export async function startAttachmentTranscription(
  accessToken: string,
  attachmentId: string,
  audioBlob: Blob,
  fileName: string
): Promise<AttachmentTranscriptionResponse> {
  invalidateAttachmentTranscriptionCache(attachmentId);
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/attachments/${encodeURIComponent(attachmentId)}/transcribe`;
  const form = new FormData();
  form.append("file", new File([audioBlob], fileName, { type: audioBlob.type || "application/octet-stream" }));
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as AttachmentTranscriptionResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Transcribe failed (${res.status})`);
  }
  return withNormalizedTranscriptionText({
    status: data.status,
    text: data.text ?? null,
    error: data.error ?? null,
  });
}

export async function waitForAttachmentTranscription(
  accessToken: string,
  attachmentId: string,
  options?: { intervalMs?: number; maxAttempts?: number }
): Promise<string> {
  const intervalMs = options?.intervalMs ?? 4500;
  const maxAttempts = options?.maxAttempts ?? 45;
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await sleep(intervalMs);
    }
    const r = await getAttachmentTranscription(accessToken, attachmentId, { bypassCache: true });
    if (r.status === "done" && r.text?.trim()) {
      return r.text.trim();
    }
    if (r.status === "failed") {
      throw new Error(r.error || "Распознавание не удалось");
    }
  }
  throw new Error("Превышено время ожидания расшифровки");
}
