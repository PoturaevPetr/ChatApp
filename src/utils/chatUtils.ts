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

export function getMessagePreviewText(content: { type: string; text?: string } | string, maxLength = 50): string {
  const text = typeof content === "string" ? content : content?.type === "text" ? content.text ?? "" : "";
  return text.length <= maxLength ? text : text.slice(0, maxLength) + "...";
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
