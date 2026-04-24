import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export function formatMessageTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return `Вчера ${format(date, "HH:mm")}`;
    return format(date, "dd MMM HH:mm", { locale: ru });
  } catch {
    return timestamp;
  }
}

/** Только часы:минуты — для пузырька в треде (дата уже в разделителе по дням). */
export function formatMessageClock(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return format(date, "HH:mm");
  } catch {
    return timestamp;
  }
}

export function formatChatDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isToday(date)) return "Сегодня";
    if (isYesterday(date)) return "Вчера";
    return format(date, "dd MMMM yyyy", { locale: ru });
  } catch {
    return timestamp;
  }
}

export function getMessagePreviewText(
  content:
    | { type: string; text?: string; file?: { name: string; mimeType?: string }; lat?: number; lng?: number }
    | string,
  maxLength = 50
): string {
  if (typeof content === "string") return content.length <= maxLength ? content : content.slice(0, maxLength) + "...";
  if (content?.type === "location") return "Геопозиция";
  if (content?.type === "file" && content.file) {
    const mime = content.file.mimeType ?? "";
    const name = content.file.name ?? "";
    const lowerName = name.toLowerCase();

    if (mime.startsWith("video/")) return "Видеосообщение";
    if (mime.startsWith("audio/")) return "Голосовое сообщение";
    if (/\.(mp4|mov|m4v|mkv)$/.test(lowerName)) return "Видеосообщение";
    if (/\.webm$/.test(lowerName)) {
      return lowerName.startsWith("audio-") ? "Голосовое сообщение" : "Видеосообщение";
    }
    if (/\.(ogg|opus|mp3|wav|m4a|aac|flac|amr)$/.test(lowerName)) return "Голосовое сообщение";

    if (mime.startsWith("image/")) return "Изображение";
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName)) return "Изображение";

    if (name) return `📎 ${name}`;
  }
  const text = content?.type === "text" ? content.text ?? "" : "";
  return text.length <= maxLength ? text : text.slice(0, maxLength) + "...";
}

/** Полный текст для копирования (без обрезки). */
export function getMessagePlainText(content: {
  type: string;
  text?: string;
  file?: { name: string; mimeType?: string };
  lat?: number;
  lng?: number;
}): string {
  if (content?.type === "location" && typeof content.lat === "number" && typeof content.lng === "number") {
    return `Геопозиция: ${content.lat.toFixed(6)}, ${content.lng.toFixed(6)}`;
  }
  if (content?.type === "file" && content.file) {
    const mime = content.file.mimeType ?? "";
    const name = content.file.name ?? "";
    const lowerName = name.toLowerCase();
    let fileLabel = "";
    if (mime.startsWith("video/") || /\.(mp4|mov|m4v|mkv)$/.test(lowerName)) {
      fileLabel = "Видеосообщение";
    } else if (/\.webm$/.test(lowerName)) {
      fileLabel = lowerName.startsWith("audio-") ? "Голосовое сообщение" : "Видеосообщение";
    } else if (mime.startsWith("audio/") || /\.(ogg|opus|mp3|wav|m4a|aac|flac|amr)$/.test(lowerName)) {
      fileLabel = "Голосовое сообщение";
    } else if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName)) {
      fileLabel = "Изображение";
    } else if (name) {
      fileLabel = `Вложение: ${name}`;
    } else {
      fileLabel = "Вложение";
    }
    const note = typeof content.text === "string" && content.text.trim() ? content.text.trim() : "";
    return note ? `${note}\n${fileLabel}` : fileLabel;
  }
  return content?.type === "text" ? (content.text ?? "") : "";
}

const PREVIEW_MAX_SIZE = 120;

/**
 * Создаёт сжатое превью изображения из data URL (для быстрого отображения до загрузки полного).
 */
export function createImagePreview(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height && width > PREVIEW_MAX_SIZE) {
          height = Math.round((height * PREVIEW_MAX_SIZE) / width);
          width = PREVIEW_MAX_SIZE;
        } else if (height > PREVIEW_MAX_SIZE) {
          width = Math.round((width * PREVIEW_MAX_SIZE) / height);
          height = PREVIEW_MAX_SIZE;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

export function sortChatsWithUnreadFirst<T extends { unreadCount: number; updatedAt: string }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function groupMessagesByDate<T extends { timestamp: string }>(messages: T[]): { date: string; messages: T[] }[] {
  const groups: Record<string, T[]> = {};
  messages.forEach((msg) => {
    const date = formatChatDate(msg.timestamp);
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
  });
  return Object.entries(groups)
    .map(([date, msgs]) => ({ date, messages: msgs }))
    .sort((a, b) => new Date(a.messages[0].timestamp).getTime() - new Date(b.messages[0].timestamp).getTime());
}
