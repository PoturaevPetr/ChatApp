import { Capacitor } from "@capacitor/core";
import type { MediaAsset } from "@capacitor-community/media";

const SORT_RECENT = [{ key: "creationDate" as const, ascending: false }];

/**
 * Недавние фото с устройства (натив). В браузере — пустой массив.
 * Пагинация: увеличивайте `limit` (15 → 35 → 55…); плагин возвращает первые N по дате.
 */
export async function fetchRecentGalleryMedias(limit: number): Promise<MediaAsset[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { Media } = await import("@capacitor-community/media");
    const res = await Media.getMedias({
      quantity: limit,
      thumbnailWidth: 400,
      thumbnailHeight: 400,
      thumbnailQuality: 88,
      types: "photos",
      sort: SORT_RECENT,
    });
    return res.medias ?? [];
  } catch (e) {
    console.warn("[galleryMedia] getMedias:", e);
    return [];
  }
}

function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType });
}

/** Полноразмерный файл для отправки (не миниатюра из getMedias). */
export async function mediaAssetToSendableFile(asset: MediaAsset, index: number): Promise<File> {
  const { Filesystem } = await import("@capacitor/filesystem");
  const platform = Capacitor.getPlatform();
  const stamp = asset.creationDate?.replace(/[:.]/g, "-") ?? String(index);
  const name = `photo_${stamp}.jpg`;

  if (platform === "ios") {
    const { Media } = await import("@capacitor-community/media");
    const { path } = await Media.getMediaByIdentifier({ identifier: asset.identifier });
    const out = await Filesystem.readFile({ path });
    const data = typeof out.data === "string" ? out.data : "";
    if (!data) throw new Error("empty file");
    return base64ToFile(data, name, "image/jpeg");
  }

  const out = await Filesystem.readFile({ path: asset.identifier });
  const data = typeof out.data === "string" ? out.data : "";
  if (!data) throw new Error("empty file");
  return base64ToFile(data, name, "image/jpeg");
}

export function mediaThumbSrc(asset: MediaAsset): string {
  const raw = asset.data?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  return `data:image/jpeg;base64,${raw}`;
}
