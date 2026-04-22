import { Capacitor } from "@capacitor/core";
import type { GalleryPhoto } from "@capacitor/camera";
import type { MediaAsset } from "@capacitor-community/media";

const SORT_RECENT = [{ key: "creationDate" as const, ascending: false }];

export type GalleryFetchResult = {
  medias: MediaAsset[];
  /** iOS: user denied photo library access (or plugin reported accessDenied). */
  permissionDenied?: boolean;
};

function isAccessDeniedError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "accessDenied") return true;
  const msg = "message" in e ? String((e as { message: unknown }).message) : "";
  return /access to photos|not allowed by user|denied permission/i.test(msg);
}

/**
 * Запрос доступа к фото (натив). На iOS/Android показывает системный диалог при необходимости.
 */
export async function requestPhotoLibraryAccess(): Promise<{ allowed: boolean }> {
  if (!Capacitor.isNativePlatform()) return { allowed: false };
  try {
    const { Camera } = await import("@capacitor/camera");
    const status = await Camera.requestPermissions({ permissions: ["photos"] });
    const photos = status.photos;
    const allowed = photos === "granted" || photos === "limited";
    return { allowed };
  } catch (e) {
    console.warn("[galleryMedia] requestPermissions photos:", e);
    return { allowed: false };
  }
}

/** Открыть настройки приложения (разрешения). Только натив. */
export async function openAppPhotoSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings");
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    });
  } catch (e) {
    console.warn("[galleryMedia] open settings:", e);
  }
}

/**
 * Android: getMedias в плагине не реализован — собираем недавние файлы через getAlbums + readdir + mtime.
 */
async function fetchRecentGalleryMediasAndroid(limit: number): Promise<GalleryFetchResult> {
  const { allowed } = await requestPhotoLibraryAccess();
  if (!allowed) return { medias: [], permissionDenied: true };
  try {
    const { Media } = await import("@capacitor-community/media");
    const { Filesystem } = await import("@capacitor/filesystem");

    const albumsRes = await Media.getAlbums();
    const albums = (albumsRes as { albums?: { identifier: string; name: string }[] }).albums ?? [];

    type Cand = { path: string; mtime: number };
    const seen = new Set<string>();
    const candidates: Cand[] = [];
    const MAX_SCAN_FILES = 5000;

    for (const album of albums) {
      if (candidates.length >= MAX_SCAN_FILES) break;
      const dir = String(album.identifier ?? "").trim();
      if (!dir || dir.includes("..") || dir.startsWith("content:")) continue;

      let entries: { name: string; type?: string; mtime?: number }[] = [];
      try {
        const rd = await Filesystem.readdir({ path: dir });
        const raw = rd.files ?? [];
        entries = raw.map((item: string | { name: string; type?: string; mtime?: number }) =>
          typeof item === "string" ? { name: item } : item,
        );
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (candidates.length >= MAX_SCAN_FILES) break;
        const name = entry.name ?? "";
        if (!name || name.startsWith(".")) continue;
        if (entry.type === "directory") continue;
        if (!/\.(jpe?g|png|heic|webp)$/i.test(name)) continue;
        const fullPath = dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);
        let mtime =
          typeof entry.mtime === "number" && Number.isFinite(entry.mtime) ? entry.mtime : 0;
        if (mtime <= 0) {
          try {
            const st = await Filesystem.stat({ path: fullPath });
            mtime =
              typeof st.mtime === "number" && Number.isFinite(st.mtime)
                ? st.mtime
                : typeof st.ctime === "number" && Number.isFinite(st.ctime)
                  ? st.ctime
                  : 0;
          } catch {
            mtime = 0;
          }
        }
        candidates.push({ path: fullPath, mtime });
      }
    }

    candidates.sort((a, b) => {
      if (b.mtime !== a.mtime) return b.mtime - a.mtime;
      return b.path.localeCompare(a.path);
    });
    const top = candidates.slice(0, limit);

    const medias: MediaAsset[] = top.map((c) => {
      const iso = c.mtime > 0 ? new Date(c.mtime).toISOString() : new Date().toISOString();
      return {
        identifier: c.path,
        data: "",
        creationDate: iso,
        thumbnailWidth: 400,
        thumbnailHeight: 400,
        fullWidth: 0,
        fullHeight: 0,
        location: { latitude: 0, longitude: 0, heading: 0, altitude: 0, speed: 0 },
      } as MediaAsset;
    });

    return { medias };
  } catch (e) {
    if (isAccessDeniedError(e)) {
      return { medias: [], permissionDenied: true };
    }
    console.warn("[galleryMedia] Android gallery scan:", e);
    return { medias: [] };
  }
}

/**
 * Недавние фото с устройства (натив). В браузере — пустой массив.
 * iOS: Media.getMedias. Android: обход без getMedias (альбомы + каталоги).
 * Пагинация: увеличивайте `limit` (например 29 → 59 → 89…).
 */
export async function fetchRecentGalleryMedias(limit: number): Promise<GalleryFetchResult> {
  if (!Capacitor.isNativePlatform()) return { medias: [] };
  if (Capacitor.getPlatform() === "android") {
    return fetchRecentGalleryMediasAndroid(limit);
  }
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
    return { medias: res.medias ?? [] };
  } catch (e) {
    if (isAccessDeniedError(e)) {
      return { medias: [], permissionDenied: true };
    }
    console.warn("[galleryMedia] getMedias:", e);
    return { medias: [] };
  }
}

function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType });
}

async function galleryPickerPhotoToFile(photo: GalleryPhoto, index: number): Promise<File | null> {
  const { Filesystem } = await import("@capacitor/filesystem");
  const stamp = Date.now();
  const name = `gallery_${stamp}_${index}.jpg`;

  const tryPath = photo.path?.trim();
  if (tryPath) {
    const fsPath = tryPath.startsWith("file://") ? tryPath.replace(/^file:\/\//, "") : tryPath;
    try {
      const out = await Filesystem.readFile({ path: fsPath });
      const data = typeof out.data === "string" ? out.data : "";
      if (data) return base64ToFile(data, name, "image/jpeg");
    } catch {
      /* fall through to webPath */
    }
  }

  const web = photo.webPath?.trim();
  if (web) {
    try {
      const r = await fetch(web);
      const blob = await r.blob();
      return new File([blob], name, { type: blob.type || "image/jpeg" });
    } catch (e) {
      console.warn("[galleryMedia] fetch webPath:", e);
    }
  }

  return null;
}

/**
 * Выбор фото из системной галереи (Android/iOS). Подходит для Android, где нет getMedias.
 */
export async function pickImageFromSystemGallery(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Camera } = await import("@capacitor/camera");
    await Camera.requestPermissions({ permissions: ["photos"] });
    const res = await Camera.pickImages({ limit: 1, quality: 92 });
    const photo = res.photos[0];
    if (!photo) return null;
    return await galleryPickerPhotoToFile(photo, 0);
  } catch (e) {
    console.warn("[galleryMedia] pickImages:", e);
    return null;
  }
}

/** Полноразмерный файл для отправки (не миниатюра из getMedias). */
export async function mediaAssetToSendableFile(asset: MediaAsset, index: number): Promise<File> {
  const { Filesystem } = await import("@capacitor/filesystem");
  const platform = Capacitor.getPlatform();
  const stamp = asset.creationDate?.replace(/[:.]/g, "-") ?? String(index);
  const extFromPath = asset.identifier.split(".").pop()?.toLowerCase() ?? "";
  const ext =
    extFromPath === "png" || extFromPath === "webp" || extFromPath === "heic" || extFromPath === "heif"
      ? extFromPath
      : "jpg";
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
          ? "image/heic"
          : "image/jpeg";
  const name = `photo_${stamp}.${ext}`;

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
  return base64ToFile(data, name, mime);
}

export function mediaThumbSrc(asset: MediaAsset): string {
  const raw = asset.data?.trim() ?? "";
  if (raw) {
    if (raw.startsWith("data:")) return raw;
    return `data:image/jpeg;base64,${raw}`;
  }
  if (Capacitor.getPlatform() === "android" && asset.identifier?.trim()) {
    try {
      const p = asset.identifier.trim();
      const fileUrl = p.startsWith("file:") ? p : `file://${p}`;
      return Capacitor.convertFileSrc(fileUrl);
    } catch {
      return "";
    }
  }
  return "";
}
