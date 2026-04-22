/** Расширение в конце имени файла, если браузер не передал MIME. */
const IMAGE_FILENAME_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

/**
 * Разрешаем только изображения (MIME image/* или, если тип пустой, типичное расширение имени файла).
 * @throws Error если файл не похож на картинку
 */
export function assertImageFileForAvatar(file: File): void {
  const type = (file.type || "").toLowerCase().trim();
  if (type) {
    if (!type.startsWith("image/")) {
      throw new Error(
        "Для аватара можно выбрать только изображение (JPEG, PNG, WebP и другие форматы фото).",
      );
    }
    return;
  }
  const name = (file.name || "").toLowerCase().trim();
  if (!IMAGE_FILENAME_EXT.test(name)) {
    throw new Error(
      "Для аватара можно выбрать только изображение. Выберите файл .jpg, .png, .webp и т.п.",
    );
  }
}

/** Чтение файла в data URL (для аватаров). */
export function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Сжимает изображение до JPEG для аватара (профиль / группа).
 * @throws если файл слишком большой после сжатия
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  assertImageFileForAvatar(file);

  const MAX_SIDE = 256;
  const QUALITY = 0.85;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      i.src = objectUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("Некорректное изображение");

    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas недоступен");
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Не удалось сжать изображение"))),
        "image/jpeg",
        QUALITY,
      );
    });

    if (blob.size > 800 * 1024) {
      throw new Error("Аватар слишком большой даже после сжатия (выберите другое фото)");
    }

    return await readFileAsDataUrl(blob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
