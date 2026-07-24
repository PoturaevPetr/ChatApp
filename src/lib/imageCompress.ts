/**
 * Сжатие изображений перед загрузкой на сервер (canvas).
 */

import { isVideoAttachment, normalizeMediaMimeType } from "@/lib/mediaMime";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const DATA_URL_BASE64_MARKER = ";base64,";

function indexOfDataUrlBase64Marker(dataUrl: string): number {
  return dataUrl.toLowerCase().indexOf(DATA_URL_BASE64_MARKER);
}

/**
 * Извлекает base64-payload из data URL.
 * Нельзя делить по первой запятой: в MIME бывает codecs=vp8,opus → ломается atob.
 */
export function dataUrlToBase64Payload(dataUrl: string): string {
  const i = indexOfDataUrlBase64Marker(dataUrl);
  if (i >= 0) return dataUrl.slice(i + DATA_URL_BASE64_MARKER.length);
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Invalid data URL");
  return dataUrl.slice(comma + 1);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const base64 = dataUrlToBase64Payload(dataUrl);
  const markerPos = indexOfDataUrlBase64Marker(dataUrl);
  const headerEnd = markerPos >= 0 ? markerPos : dataUrl.indexOf(",");
  if (headerEnd < 5) throw new Error("Invalid data URL");
  const header = dataUrl.slice(0, headerEnd);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1].trim() : "image/jpeg";
  const binary = atob(base64.replace(/\s/g, ""));
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Уменьшить изображение по длинной стороне и перекодировать в JPEG. */
export function resizeDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

export interface PreparedAttachment {
  full: Blob;
  thumb: Blob | null;
  mimeType: string;
  name: string;
}

/** Первый кадр видео как JPEG-превью (для быстрого показа кружка у получателя). */
export async function extractVideoPosterBlob(file: File, maxSide = 480): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<Blob | null>((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      let settled = false;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(blob);
      };
      const timeout = window.setTimeout(() => finish(null), 12_000);
      const cleanup = () => window.clearTimeout(timeout);
      video.onerror = () => {
        cleanup();
        finish(null);
      };
      video.onloadeddata = () => {
        try {
          const dur = video.duration;
          video.currentTime =
            Number.isFinite(dur) && dur > 0 ? Math.min(0.08, dur * 0.05) : 0.05;
        } catch {
          cleanup();
          finish(null);
        }
      };
      video.onseeked = () => {
        cleanup();
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) {
            finish(null);
            return;
          }
          const scale = Math.min(1, maxSide / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(null);
            return;
          }
          ctx.drawImage(video, 0, 0, cw, ch);
          canvas.toBlob((b) => finish(b), "image/jpeg", 0.82);
        } catch {
          finish(null);
        }
      };
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Готовит тело для multipart: фото — сжатие + превью; видео — poster JPEG; остальное — как есть. */
export async function prepareAttachmentForUpload(file: File): Promise<PreparedAttachment> {
  const mimeType = normalizeMediaMimeType(file.type || "", file.name);
  const name = file.name || "file";

  if (file.type.startsWith("image/") || mimeType.startsWith("image/")) {
    const raw = await readFileAsDataURL(file);
    const fullDataUrl = await resizeDataUrl(raw, 2048, 0.82);
    const thumbDataUrl = await resizeDataUrl(raw, 400, 0.68);
    return {
      full: dataUrlToBlob(fullDataUrl),
      thumb: dataUrlToBlob(thumbDataUrl),
      mimeType: "image/jpeg",
      name: /\.(jpe?g|png|gif|webp)$/i.test(name) ? name.replace(/\.[^.]+$/, ".jpg") : `${name}.jpg`,
    };
  }

  if (isVideoAttachment(file.type || mimeType, name)) {
    const poster = await extractVideoPosterBlob(file).catch(() => null);
    return {
      full: file,
      thumb: poster,
      mimeType: mimeType.startsWith("video/") ? mimeType : "video/webm",
      name,
    };
  }

  return {
    full: file,
    thumb: null,
    mimeType,
    name,
  };
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64.replace(/\s/g, ""));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}
