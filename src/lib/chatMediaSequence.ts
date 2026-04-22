import { useChatStore } from "@/stores/chatStore";
import type { ChatMessage } from "@/stores/chatStore";

/** Автовоспроизведение следующего аудио/видео-кружка в активном чате */
export const CHAT_MEDIA_PLAY_NEXT = "chatapp:media-play-next";

export function isPlayableChatMediaMessage(msg: ChatMessage): boolean {
  if (msg.content.type !== "file") return false;
  const mt = msg.content.file.mimeType;
  return mt.startsWith("audio/") || mt.startsWith("video/");
}

/** Следующее по ленте сообщение с аудио или видео-кружком (ниже в чате = больший индекс). */
export function findNextPlayableChatMessageId(afterMessageId: string): string | undefined {
  const messages = useChatStore.getState().activeChatMessages;
  const idx = messages.findIndex((m) => m.id === afterMessageId);
  if (idx === -1) return undefined;
  for (let i = idx + 1; i < messages.length; i++) {
    if (isPlayableChatMediaMessage(messages[i])) return messages[i].id;
  }
  return undefined;
}

export function requestPlayNextChatMediaAfter(endedMessageId: string | undefined): void {
  if (!endedMessageId) return;
  const nextId = findNextPlayableChatMessageId(endedMessageId);
  if (!nextId) return;
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent(CHAT_MEDIA_PLAY_NEXT, { detail: { messageId: nextId } }));
  });
}
