import { decryptMessage } from "@/lib/decryptMessage";
import { getMessage, getMessages, type MessageResponse } from "@/services/chatMessagesApi";
import { getRooms, type Room } from "@/services/chatRoomsApi";
import { buildMessageContentFromDecrypt, type ChatMessageContent, type ChatMessageFile } from "@/stores/chatStore";

const PAGE_SIZE = 100;
/** Ограничение глубины истории при сборе вложений (страницы по PAGE_SIZE). */
const MAX_PAGES = 40;

export type PeerMediaKind = "image" | "video" | "audio" | "file";

export interface PeerMediaItem {
  /** Стабильный ключ для React и превью: messageId или attachment_id для file_ref */
  id: string;
  messageId: string;
  sentAt: string;
  name: string;
  mimeType: string;
  kind: PeerMediaKind;
  file: ChatMessageFile;
  senderId: string;
  /** Сообщение от текущего пользователя — выравнивание как в чате. */
  isOwn: boolean;
}

export function classifyMediaMime(mime: string): PeerMediaKind {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

export function findDirectRoomIdForPeer(rooms: Room[], meId: string, peerUserId: string): string | null {
  const p = peerUserId.trim().toLowerCase();
  const m = meId.trim().toLowerCase();
  const room = rooms.find(
    (r) =>
      r.users.length === 2 &&
      r.users.some((u) => String(u.id).toLowerCase() === p) &&
      r.users.some((u) => String(u.id).toLowerCase() === m),
  );
  return room?.id?.trim() ? room.id : null;
}

async function decryptMessageContent(
  row: MessageResponse,
  privateKeyPem: string,
  accessToken: string,
): Promise<ChatMessageContent | null> {
  try {
    let m = row;
    if (m.has_attachment && (!m.encrypted_data || !m.nonce)) {
      const full = await getMessage(accessToken, String(m.message_id));
      if (!full) return null;
      m = full;
    }
    if (!m.encrypted_data || !m.encrypted_aes_key || !m.nonce) return null;
    const raw = await decryptMessage(m.encrypted_data, m.encrypted_aes_key, m.nonce, privateKeyPem);
    return buildMessageContentFromDecrypt(raw as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

function fileMessageToItem(
  messageId: string,
  sentAt: string,
  file: ChatMessageFile,
  senderId: string,
  currentUserId: string,
): PeerMediaItem | null {
  const mime = file.mimeType || "application/octet-stream";
  const hasInline = typeof file.data === "string" && file.data.length > 0;
  const ref = file.file_ref;
  const hasRef = Boolean(ref?.attachment_id && ref.full_key_b64 && ref.full_nonce_b64);
  if (!hasInline && !hasRef) return null;
  const kind = classifyMediaMime(mime);
  const id = file.file_ref?.attachment_id
    ? `${messageId}-${file.file_ref.attachment_id}`
    : `inline-${messageId}`;
  const sid = String(senderId ?? "").toLowerCase();
  const me = String(currentUserId ?? "").toLowerCase();
  return {
    id,
    messageId,
    sentAt,
    name: file.name || "Файл",
    mimeType: mime,
    kind,
    file: { ...file },
    senderId: String(senderId),
    isOwn: Boolean(me && sid === me),
  };
}

/**
 * Загружает и расшифровывает сообщения комнаты 1-1 с peer, возвращает вложения по типам.
 */
export async function loadPeerChatMediaItems(
  accessToken: string,
  currentUserId: string,
  peerUserId: string,
  privateKeyPem: string,
): Promise<{ roomId: string | null; items: PeerMediaItem[]; error: string | null }> {
  const rooms = await getRooms(accessToken);
  const roomId = findDirectRoomIdForPeer(rooms, currentUserId, peerUserId);
  if (!roomId) {
    return { roomId: null, items: [], error: null };
  }

  const batches: MessageResponse[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const chunk = await getMessages(accessToken, PAGE_SIZE, page * PAGE_SIZE, false, roomId, false);
    if (!chunk.length) break;
    batches.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  const items: PeerMediaItem[] = [];
  for (const m of batches) {
    const content = await decryptMessageContent(m, privateKeyPem, accessToken);
    if (!content || content.type !== "file") continue;
    const item = fileMessageToItem(
      String(m.message_id),
      m.sent_at,
      content.file,
      String(m.sender_id ?? ""),
      currentUserId,
    );
    if (item) items.push(item);
  }

  items.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  return { roomId, items, error: null };
}
