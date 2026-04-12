/**
 * Сжатие изображений перед загрузкой на сервер (canvas).
 */

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

/** Готовит тело для multipart: для фото — сжатие + превью; для остального — как есть. */
export async function prepareAttachmentForUpload(file: File): Promise<PreparedAttachment> {
  if (!file.type.startsWith("image/")) {
    return {
      full: file,
      thumb: null,
      mimeType: file.type || "application/octet-stream",
      name: file.name,
    };
  }
  const raw = await readFileAsDataURL(file);
  const fullDataUrl = await resizeDataUrl(raw, 2048, 0.82);
  const thumbDataUrl = await resizeDataUrl(raw, 400, 0.68);
  return {
    full: dataUrlToBlob(fullDataUrl),
    thumb: dataUrlToBlob(thumbDataUrl),
    mimeType: "image/jpeg",
    name: /\.(jpe?g|png|gif|webp)$/i.test(file.name) ? file.name.replace(/\.[^.]+$/, ".jpg") : `${file.name}.jpg`,
  };
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64.replace(/\s/g, ""));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}
