"use client";

import { create } from "zustand";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys } from "@/lib/secureStorage";
import { getRooms, createRoom } from "@/services/chatRoomsApi";
import { getMessages, getMessage, markMessageAsRead, type MessageResponse } from "@/services/chatMessagesApi";
import { getReactionsBatch } from "@/services/chatReactionsApi";
import { decryptMessage } from "@/lib/decryptMessage";
import { chatWebSocket } from "@/services/chatWebSocket";
import {
  appendMessage,
  markThreadAsRead,
  getDemoUsers,
} from "@/lib/storage";
import {
  prepareAttachmentForUpload,
  base64ToBlob,
  blobToDataURL,
  dataUrlToBase64Payload,
} from "@/lib/imageCompress";
import { encryptAttachmentBytes } from "@/lib/fileCrypto";
import { uploadRoomAttachments } from "@/services/chatAttachmentsApi";
import { clearAttachmentMediaCache } from "@/lib/attachmentMediaCache";
import { encryptMessagePayloadForChatService } from "@/lib/chatE2E";
import { getMyKeypair, getPublicKey } from "@/services/chatKeysApi";
import { clearChatsListCache, readChatsListCache, writeChatsListCache } from "@/lib/chatsListCache";
import {
  clearThreadMessagesCacheForUser,
  readThreadMessagesCache,
  scheduleThreadMessagesCacheWrite,
} from "@/lib/threadMessagesCache";

export interface ChatUser {
  id: string;
  name: string;
  avatar?: string | null;
  /** ISO 8601 с сервера (GET user / список комнат). */
  lastSeenAt?: string | null;
  /** Локально по WebSocket user_online / user_offline (один воркер; без Redis может расходиться). */
  isOnline?: boolean;
}

export interface ChatMessageFileRef {
  attachment_id: string;
  thumb_attachment_id?: string;
  /** AES-GCM ключи для ciphertext в БД (попадают в E2E-шифруемое тело сообщения). */
  full_key_b64: string;
  full_nonce_b64: string;
  thumb_key_b64?: string;
  thumb_nonce_b64?: string;
}

export interface ChatMessageFile {
  name: string;
  mimeType: string;
  data: string; // base64; пусто если загрузка по REST (file_ref)
  file_ref?: ChatMessageFileRef;
  /** Только клиент: исходный File до чтения в base64 (нативный выбор файла и т.п.). */
  nativeFile?: File;
  /** Локальный object/blob URL для превью до загрузки. */
  localPreviewUrl?: string | null;
}

/** Вложение в sendMessage: полное тело или только nativeFile (дополним внутри стора). */
export type SendMessageFileArg = ChatMessageFile | { nativeFile: File };

/** Ссылка на сообщение, на которое отвечаем (хранится в теле сообщения, без изменений БД). */
export interface ReplyTo {
  id: string;
  preview: string;
}

export type ChatMessageContent =
  | { type: "text"; text: string; reply_to?: ReplyTo }
  | { type: "file"; text?: string; file: ChatMessageFile; reply_to?: ReplyTo };

/** Реакция на сообщение (одна на пользователя в комнате, см. API). */
export interface MessageReaction {
  userId: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: ChatMessageContent;
  timestamp: string;
  status: "sent" | "delivered" | "read";
  isOwn: boolean;
  reactions?: MessageReaction[];
  /** Локальный статус загрузки вложения (optimistic UI, не хранится на сервере). */
  isUploading?: boolean;
  /** 0..100, только локально для индикатора загрузки. */
  uploadProgress?: number;
  /** Локальная ошибка загрузки вложения. */
  uploadError?: string | null;
}

export interface ChatListItem {
  id: string;
  otherUser: ChatUser;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
  /** Для превью последнего сообщения в списке чатов */
  roomType?: "direct" | "group";
  /** Группа: id пользователя (lowercase) → только имя (для превью последнего сообщения в списке) */
  memberShortNameByUserId?: Record<string, string>;
  /** Группа: кто создал (для UI шапки чата). */
  groupCreatedBy?: string | null;
  /** Группа: участники для аватаров реакций и т.п. */
  groupMembers?: { id: string; avatar?: string | null }[];
}

function threadId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

/** Синтетический peer id для групповой комнаты (см. `/chat?roomId=…`). Не путать с UUID пользователя. */
const GROUP_THREAD_PEER_PREFIX = "g:";

export function groupSyntheticPeerId(roomId: string): string {
  return `${GROUP_THREAD_PEER_PREFIX}${String(roomId ?? "").trim()}`;
}

export function isGroupThreadPeerId(peerId: string | null | undefined): boolean {
  if (peerId == null) return false;
  return String(peerId).startsWith(GROUP_THREAD_PEER_PREFIX);
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** room_id из синтетического peer группы `g:{uuid}` или из списка чатов. */
function resolveRoomIdForThreadPeer(chats: ChatListItem[], otherUserId: string): string | null {
  const otherLower = otherUserId.toLowerCase();
  const fromList = chats.find((c) => String(c.otherUser.id).toLowerCase() === otherLower)?.id ?? null;
  if (fromList) return fromList;
  if (isGroupThreadPeerId(otherUserId)) {
    const tail = otherUserId.slice(GROUP_THREAD_PEER_PREFIX.length).trim();
    if (UUID_V4_RE.test(tail)) return tail;
  }
  return null;
}

let loadChatsPromise: Promise<void> | null = null;
let loadMessagesPromise: Promise<void> | null = null;
let loadMessagesThreadId: string | null = null;

/** Авто-сброс индикатора «собеседник печатает», если не пришёл is_typing: false. */
let peerTypingAutoClearTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPeerTypingAutoClear(): void {
  if (peerTypingAutoClearTimer != null) {
    clearTimeout(peerTypingAutoClearTimer);
    peerTypingAutoClearTimer = null;
  }
}

function schedulePeerTypingAutoClear(
  roomId: string,
  userId: string,
  get: () => ChatState,
  set: (s: Partial<ChatState> | ((prev: ChatState) => Partial<ChatState>)) => void,
): void {
  cancelPeerTypingAutoClear();
  peerTypingAutoClearTimer = setTimeout(() => {
    peerTypingAutoClearTimer = null;
    const p = get().peerTyping;
    if (p && p.roomId === roomId && p.userId === userId) {
      set({ peerTyping: null });
    }
  }, 4000);
}

const INITIAL_MESSAGES_LIMIT = 50;
const LOAD_OLDER_MESSAGES_LIMIT = 20;

function displayNameForUserId(userId: string): string {
  const short = String(userId).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}

function memberFirstNameForGroupListPreview(u: {
  id: string;
  first_name?: string;
}): string {
  const first = (u.first_name ?? "").trim();
  if (first) return first;
  return displayNameForUserId(u.id);
}

/** Собирает контент сообщения из расшифрованного JSON (inline file, file_ref или текст). */
export function buildMessageContentFromDecrypt(content: Record<string, unknown> | null | undefined): ChatMessageContent {
  if (!content) return { type: "text", text: "" };
  const text = typeof content.text === "string" ? content.text : "";
  const rawReplyTo = content.reply_to as { id?: string; preview?: string } | undefined;
  const replyTo: ReplyTo | undefined =
    rawReplyTo && typeof rawReplyTo.id === "string" && typeof rawReplyTo.preview === "string"
      ? { id: rawReplyTo.id, preview: rawReplyTo.preview }
      : undefined;
  const fr = content.file_ref as {
    attachment_id?: string;
    thumb_attachment_id?: string;
    name?: string;
    mimeType?: string;
    full_key_b64?: string;
    full_nonce_b64?: string;
    thumb_key_b64?: string;
    thumb_nonce_b64?: string;
  } | undefined;
  if (fr && typeof fr.attachment_id === "string" && fr.attachment_id.length > 0) {
    const tid =
      typeof fr.thumb_attachment_id === "string" && fr.thumb_attachment_id.length > 0
        ? fr.thumb_attachment_id
        : undefined;
    const fk = typeof fr.full_key_b64 === "string" ? fr.full_key_b64 : "";
    const fn = typeof fr.full_nonce_b64 === "string" ? fr.full_nonce_b64 : "";
    const ref: ChatMessageFileRef = {
      attachment_id: fr.attachment_id,
      full_key_b64: fk,
      full_nonce_b64: fn,
    };
    if (tid) ref.thumb_attachment_id = tid;
    if (typeof fr.thumb_key_b64 === "string" && fr.thumb_key_b64.length > 0) ref.thumb_key_b64 = fr.thumb_key_b64;
    if (typeof fr.thumb_nonce_b64 === "string" && fr.thumb_nonce_b64.length > 0)
      ref.thumb_nonce_b64 = fr.thumb_nonce_b64;
    return {
      type: "file",
      text: text || undefined,
      file: {
        name: typeof fr.name === "string" ? fr.name : "file",
        mimeType: typeof fr.mimeType === "string" ? fr.mimeType : "application/octet-stream",
        data: "",
        file_ref: ref,
      },
      reply_to: replyTo,
    };
  }
  const filePayload = content.file as { name?: string; mimeType?: string; data?: string } | undefined;
  const hasFile = filePayload && typeof filePayload.name === "string" && typeof filePayload.data === "string";
  if (hasFile) {
    return {
      type: "file",
      text: text || undefined,
      file: {
        name: filePayload!.name ?? "file",
        mimeType: typeof filePayload!.mimeType === "string" ? filePayload!.mimeType : "application/octet-stream",
        data: filePayload!.data!,
      },
      reply_to: replyTo,
    };
  }
  return { type: "text", text, reply_to: replyTo };
}

type ChatStoreGetSet = {
  get: () => ChatState;
  set: (s: Partial<ChatState> | ((prev: ChatState) => Partial<ChatState>)) => void;
};

function persistActiveThreadSnapshot(
  get: () => ChatState,
  immediate?: boolean,
  userIdForCache?: string | null,
): void {
  const uid = (userIdForCache?.trim() || get().chatsLoadedForUserId)?.trim();
  const tid = get().activeChatId;
  if (!uid || !tid) return;
  const s = get();
  scheduleThreadMessagesCacheWrite(
    uid,
    tid,
    {
      roomId: s.activeRoomId,
      messages: s.activeChatMessages as unknown[],
      activeChatNextOffset: s.activeChatNextOffset,
      activeChatHasMoreOlder: s.activeChatHasMoreOlder,
    },
    immediate === true,
  );
}

function mergeOneUserReaction(
  prev: MessageReaction[] | undefined,
  userId: string,
  emoji: string,
  removed: boolean,
): MessageReaction[] {
  const u = userId.trim().toLowerCase();
  const base = (prev ?? []).filter((r) => String(r.userId).trim().toLowerCase() !== u);
  if (removed) return base;
  return [...base, { userId, emoji }];
}

function patchMessageReactions(
  m: ChatMessage,
  messageId: string,
  userId: string,
  emoji: string,
  removed: boolean,
): ChatMessage {
  if (m.id !== messageId) return m;
  return { ...m, reactions: mergeOneUserReaction(m.reactions, userId, emoji, removed) };
}

async function mergeReactionsFromBatch(
  accessToken: string,
  roomId: string,
  activeThreadId: string,
  messageIds: string[],
  get: () => ChatState,
  set: (s: Partial<ChatState> | ((prev: ChatState) => Partial<ChatState>)) => void,
): Promise<void> {
  const ids = messageIds.filter((id) => id && !id.startsWith("msg_"));
  if (!ids.length) return;
  try {
    const batch = await getReactionsBatch(accessToken, roomId, ids);
    if (get().activeChatId !== activeThreadId) return;
    set((s) => ({
      activeChatMessages: s.activeChatMessages.map((m) => {
        const rows = batch[m.id];
        if (rows === undefined) return m;
        return { ...m, reactions: rows };
      }),
    }));
  } catch {
    //
  }
}

async function buildChatMessagesFromApiResponses(
  forThisChat: MessageResponse[],
  me: string,
  accessToken: string,
  keys: { private_key: string },
  loadedForThread: string,
  { get, set }: ChatStoreGetSet,
): Promise<ChatMessage[]> {
  const needFullFetch = forThisChat.filter(
    (m) => m.has_attachment && (!m.encrypted_data || !m.nonce),
  );

  const decrypted = await Promise.all(
    forThisChat.map(async (m) => {
      const hasPlaceholder = needFullFetch.some((f) => String(f.message_id) === String(m.message_id));
      if (hasPlaceholder) {
        return {
          id: String(m.message_id),
          senderId: String(m.sender_id),
          recipientId: m.recipient_id ?? "",
          content: {
            type: "file" as const,
            file: {
              name: "Файл",
              mimeType: "application/octet-stream",
              data: "",
            },
          },
          timestamp: m.sent_at,
          status: (m.is_read ? "read" : "delivered") as "read" | "delivered",
          isOwn: String(m.sender_id).toLowerCase() === me,
        };
      }
      const content = await decryptMessage(
        m.encrypted_data!,
        m.encrypted_aes_key,
        m.nonce!,
        keys.private_key,
      );
      const messageContent = buildMessageContentFromDecrypt(content as Record<string, unknown> | null);
      return {
        id: String(m.message_id),
        senderId: String(m.sender_id),
        recipientId: m.recipient_id ?? "",
        content: messageContent,
        timestamp: m.sent_at,
        status: (m.is_read ? "read" : "delivered") as "read" | "delivered",
        isOwn: String(m.sender_id).toLowerCase() === me,
      };
    }),
  );

  decrypted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (needFullFetch.length === 0) return decrypted;

  needFullFetch.forEach((m) => {
    const messageId = String(m.message_id);
    getMessage(accessToken, messageId).then((full) => {
      if (!full || get().activeChatId !== loadedForThread) return;
      decryptMessage(
        full.encrypted_data,
        full.encrypted_aes_key,
        full.nonce,
        keys.private_key,
      )
        .then((content) => {
          if (!content || get().activeChatId !== loadedForThread) return;
          const messageContent = buildMessageContentFromDecrypt(content as Record<string, unknown> | null);
          const updated: ChatMessage = {
            id: messageId,
            senderId: String(full.sender_id),
            recipientId: full.recipient_id ?? "",
            content: messageContent,
            timestamp: full.sent_at,
            status: full.is_read ? "read" : "delivered",
            isOwn: String(full.sender_id).toLowerCase() === me,
          };
          set((s) => ({
            activeChatMessages: s.activeChatMessages.map((msg) =>
              msg.id === messageId ? updated : msg,
            ),
          }));
          queueMicrotask(() => persistActiveThreadSnapshot(get, false));
        })
        .catch(() => {});
    });
  });

  return decrypted;
}

async function runLoadMessagesInner(
  currentUserId: string,
  otherUserId: string,
  roomId: string | null,
  accessToken: string,
  keys: { private_key: string } | null,
  tid: string,
  silentRefresh: boolean,
  get: () => ChatState,
  set: (s: Partial<ChatState> | ((prev: ChatState) => Partial<ChatState>)) => void,
): Promise<void> {
  const me = currentUserId.toLowerCase();
  const other = otherUserId.toLowerCase();
  const gs: ChatStoreGetSet = { get, set };
  try {
    const apiMessages = await getMessages(
      accessToken,
      INITIAL_MESSAGES_LIMIT,
      0,
      false,
      roomId ?? undefined,
      !silentRefresh && !!roomId,
    );
    const forThisChat = roomId
      ? apiMessages
      : apiMessages.filter((m) => {
          const sid = String(m.sender_id ?? "").toLowerCase();
          const rid = String(m.recipient_id ?? "").toLowerCase();
          const pairMatch = (sid === me && rid === other) || (sid === other && rid === me);
          return pairMatch;
        });

    if (!keys?.private_key) {
      if (!silentRefresh) {
        const disk = await readThreadMessagesCache(currentUserId, tid);
        if (disk?.messages?.length && get().activeChatId === tid) {
          set({
            activeChatMessages: disk.messages as ChatMessage[],
            isMessagesLoading: false,
            error: null,
            activeChatNextOffset: disk.activeChatNextOffset,
            activeChatHasMoreOlder: disk.activeChatHasMoreOlder,
          });
          return;
        }
        set({
          activeChatMessages: [],
          isMessagesLoading: false,
          error: "Нет ключа расшифровки. Войдите заново или зарегистрируйтесь в приложении.",
          activeChatNextOffset: 0,
          activeChatHasMoreOlder: false,
        });
      }
      return;
    }

    const loadedForThread = threadId(currentUserId, otherUserId);
    const decrypted = await buildChatMessagesFromApiResponses(
      forThisChat,
      me,
      accessToken,
      keys,
      loadedForThread,
      gs,
    );

    const pageLen = apiMessages.length;
    const hasMoreOlder = pageLen === INITIAL_MESSAGES_LIMIT;

    if (get().activeChatId === loadedForThread) {
      set({
        activeChatMessages: decrypted,
        isMessagesLoading: false,
        error: null,
        /** Смещение по ответу API (глобальная лента без room_id — не длина отфильтрованного списка). */
        activeChatNextOffset: pageLen,
        activeChatHasMoreOlder: hasMoreOlder,
      });
      queueMicrotask(() => persistActiveThreadSnapshot(get, true, currentUserId));
      if (roomId) {
        void mergeReactionsFromBatch(accessToken, roomId, loadedForThread, decrypted.map((m) => m.id), get, set);
      }
    } else {
      set({ isMessagesLoading: false });
    }
  } catch (e) {
    console.warn("loadMessages from API failed:", e);
    const disk = await readThreadMessagesCache(currentUserId, tid);
    if (!silentRefresh && disk?.messages?.length && get().activeChatId === tid) {
      set({
        activeChatMessages: disk.messages as ChatMessage[],
        isMessagesLoading: false,
        error: null,
        activeChatNextOffset: disk.activeChatNextOffset,
        activeChatHasMoreOlder: disk.activeChatHasMoreOlder,
      });
      return;
    }
    if (!silentRefresh) {
      set({
        activeChatMessages: [],
        isMessagesLoading: false,
        error: e instanceof Error ? e.message : "Не удалось загрузить сообщения",
        activeChatNextOffset: 0,
        activeChatHasMoreOlder: false,
      });
    }
  }
}

export interface LoadChatsOptions {
  /** Сбросить кэш и показать полный индикатор загрузки */
  force?: boolean;
}

interface ChatState {
  users: ChatUser[];
  chats: ChatListItem[];
  /** Для какого user.id последний раз успешно подгрузили список (stale-while-revalidate). */
  chatsLoadedForUserId: string | null;
  activeChatId: string | null;
  activeRoomId: string | null;
  activeChatMessages: ChatMessage[];
  /** Следующий offset для GET /messages (порядок sent_at desc на сервере). */
  activeChatNextOffset: number;
  /** Есть ли ещё более старые сообщения для подгрузки при скролле вверх. */
  activeChatHasMoreOlder: boolean;
  isLoadingOlderMessages: boolean;
  activeChatUser: ChatUser | null;
  isLoading: boolean;
  isMessagesLoading: boolean;
  isSending: boolean;
  /** Запрос свежего списка чатов с сервера (GET rooms + расшифровка превью); для шапки «Обновление». */
  isFetchingChatList: boolean;
  error: string | null;
  /** user_typing в текущей комнате (до таймаута или is_typing: false). */
  peerTyping: { roomId: string; userId: string; until: number } | null;
  setPeerTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  loadUsers: () => void;
  loadChats: (currentUserId: string, options?: LoadChatsOptions) => Promise<void>;
  /** Сброс чата при выходе из аккаунта */
  resetSession: () => void;
  loadMessages: (currentUserId: string, otherUserId: string, silentRefresh?: boolean) => Promise<void>;
  /** Подгрузить более старые сообщения (по 20) при скролле к верху ленты. */
  loadOlderMessages: (currentUserId: string) => Promise<void>;
  sendMessage: (
    currentUserId: string,
    recipientId: string,
    text: string,
    file?: SendMessageFileArg,
    replyTo?: ReplyTo
  ) => Promise<ChatMessage | null>;
  setActiveChat: (currentUserId: string, otherUser: ChatUser) => void;
  clearActiveChat: () => void;
  markAsRead: (currentUserId: string, otherUserId: string) => void;
  /** Удалить чат из списка (по roomId) локально. */
  removeChatByRoomId: (roomId: string) => void;
  addIncomingWsMessage: (payload: {
    message_id: string;
    sender_id: string;
    recipient_id: string | null;
    room_id: string | null;
    currentUserId: string;
    text?: string;
  }) => void;
  /** Вызвать при открытии WebSocket: повторно отправить join_room для текущего чата. */
  rejoinRoomIfNeeded: () => void;
  /** Обновить только что отправленное сообщение серверными id и временем (из message_sent). */
  updateSentMessage: (messageId: string, sentAt: string) => void;
  /** Событие message_read: собеседник прочитал наше сообщение — две галочки. */
  markOwnMessageReadByPeer: (messageId: string) => void;
  /** Убрать сообщение из активного треда и обновить превью в списке чатов (после DELETE на сервере или по WebSocket message_deleted). */
  removeMessageFromActiveChat: (messageId: string) => void;
  /** WebSocket message_reaction или ответ POST /reactions — обновить чипы в ленте и в превью списка. */
  applyMessageReaction: (payload: {
    roomId: string;
    messageId: string;
    userId: string;
    emoji: string;
    removed: boolean;
  }) => void;
  /** Участника удалили из комнаты (WS room_member_removed). */
  applyRoomMemberRemoved: (roomId: string, removedUserId: string, currentUserId: string) => void;
  /** События user_online / user_offline для подписи «в сети» / last seen. */
  updatePeerPresence: (userId: string, online: boolean, atIso?: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  users: [],
  chats: [],
  chatsLoadedForUserId: null,
  activeChatId: null,
  activeRoomId: null,
  activeChatMessages: [],
  activeChatNextOffset: 0,
  activeChatHasMoreOlder: false,
  isLoadingOlderMessages: false,
  activeChatUser: null,
  isLoading: false,
  isMessagesLoading: false,
  isSending: false,
  isFetchingChatList: false,
  error: null,
  peerTyping: null,

  loadUsers: () => {
    const list = getDemoUsers().map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }));
    set({ users: list });
  },

  resetSession: () => {
    const uid = get().chatsLoadedForUserId;
    loadChatsPromise = null;
    loadMessagesPromise = null;
    loadMessagesThreadId = null;
    clearAttachmentMediaCache();
    void clearChatsListCache();
    if (uid) void clearThreadMessagesCacheForUser(uid);
    cancelPeerTypingAutoClear();
    set({
      users: [],
      chats: [],
      chatsLoadedForUserId: null,
      activeChatId: null,
      activeRoomId: null,
      activeChatMessages: [],
      activeChatNextOffset: 0,
      activeChatHasMoreOlder: false,
      isLoadingOlderMessages: false,
      activeChatUser: null,
      isLoading: false,
      isMessagesLoading: false,
      isSending: false,
      isFetchingChatList: false,
      error: null,
      peerTyping: null,
    });
  },

  loadChats: async (currentUserId: string, options?: LoadChatsOptions) => {
    if (loadChatsPromise) {
      await loadChatsPromise;
      return;
    }
    const force = options?.force === true;
    loadChatsPromise = (async () => {
      const prevLoadedFor = get().chatsLoadedForUserId;
      if (prevLoadedFor !== null && prevLoadedFor !== currentUserId) {
        set({ chats: [], chatsLoadedForUserId: null });
      }

      /** Cold start / после перезапуска: показать последний сохранённый список без пустого экрана. */
      if (typeof window !== "undefined") {
        const disk = await readChatsListCache(currentUserId);
        if (disk && disk.length > 0 && get().chats.length === 0) {
          set({
            chats: disk as ChatListItem[],
            chatsLoadedForUserId: currentUserId,
            isLoading: false,
            error: null,
          });
        }
      }

      const hasRowsForUser =
        get().chats.length > 0 && get().chatsLoadedForUserId === currentUserId;
      if (!hasRowsForUser) {
        set({ isLoading: true, error: null });
      } else {
        set({ error: null, isLoading: false });
      }

      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          set({ chats: [], chatsLoadedForUserId: null, isLoading: false, isFetchingChatList: false });
          return;
        }
        set({ isFetchingChatList: true });
        const currentId = currentUserId.toLowerCase();
        const keys = await getChatKeys();
        const rooms = await getRooms(tokens.access_token);
        const prevChats = get().chats;

        const chatsWithLastMessage = await Promise.all(
          rooms.map(async (room): Promise<ChatListItem | null> => {
            const other = room.users.find((u) => String(u.id).toLowerCase() !== currentId);
            if (!other) return null;
            const isGroup =
              String(room.room_type ?? "").toLowerCase() === "group" ||
              (Array.isArray(room.users) && room.users.length > 2);

            const memberShortNameByUserId: Record<string, string> = {};
            for (const u of room.users) {
              memberShortNameByUserId[String(u.id).toLowerCase()] = memberFirstNameForGroupListPreview(u);
            }

            let otherUser: ChatUser;
            if (isGroup) {
              const prev = prevChats.find((c) => c.id === room.id);
              const title = (room.name && String(room.name).trim()) || "Группа";
              otherUser = {
                id: groupSyntheticPeerId(room.id),
                name: title,
                avatar: room.avatar ?? prev?.otherUser.avatar ?? null,
                lastSeenAt: prev?.otherUser.lastSeenAt ?? null,
                isOnline: prev?.otherUser.isOnline,
              };
            } else {
              const parts = [other.last_name, other.first_name, other.middle_name].filter(Boolean) as string[];
              const displayName =
                parts.length > 0 ? parts.join(" ").trim() : (room.name || displayNameForUserId(other.id));
              const prev = prevChats.find((c) => c.id === room.id || c.otherUser.id === other.id);
              otherUser = {
                id: other.id,
                name: displayName,
                avatar: other.avatar ?? null,
                lastSeenAt: other.last_seen_at ?? prev?.otherUser.lastSeenAt ?? null,
                isOnline: prev?.otherUser.isOnline,
              };
            }
            let lastMessage: ChatMessage | null = null;
            let updatedAt = room.created_at ?? new Date().toISOString();
            const unreadCount = typeof (room as unknown as { unread_count?: unknown }).unread_count === "number" ? (room as unknown as { unread_count: number }).unread_count : 0;
            if (room.last_message && keys?.private_key) {
              const lm = room.last_message;
              const content = await decryptMessage(
                lm.encrypted_data,
                lm.encrypted_aes_key,
                lm.nonce,
                keys.private_key
              );
              const messageContent = buildMessageContentFromDecrypt(content as Record<string, unknown> | null);
              lastMessage = {
                id: String(lm.message_id),
                senderId: String(lm.sender_id),
                recipientId: lm.recipient_id ?? "",
                content: messageContent,
                timestamp: lm.sent_at,
                status: lm.is_read ? "read" : "delivered",
                isOwn: String(lm.sender_id).toLowerCase() === currentId,
              };
              updatedAt = lm.sent_at;
            }
            return {
              id: room.id,
              otherUser,
              lastMessage,
              unreadCount,
              updatedAt,
              roomType: isGroup ? ("group" as const) : ("direct" as const),
              memberShortNameByUserId: isGroup ? memberShortNameByUserId : undefined,
              groupMembers: isGroup
                ? room.users.map((u) => ({ id: String(u.id), avatar: u.avatar ?? null }))
                : undefined,
            };
          })
        );

        const chats = chatsWithLastMessage
          .filter((c): c is ChatListItem => c !== null)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        set({ chats, isLoading: false, error: null, chatsLoadedForUserId: currentUserId });
        void writeChatsListCache(currentUserId, chats);

        const activeUser = get().activeChatUser;
        if (activeUser) {
          const roomId = chats.find((c) => c.otherUser.id === activeUser.id)?.id ?? null;
          set({ activeRoomId: roomId });
          if (roomId && chatWebSocket.isConnected()) {
            console.log("[Chat] Вход в чат (после загрузки списка, активный чат): room_id=", roomId);
            chatWebSocket.send({ type: "join_room", data: { room_id: roomId } });
          }
        }
      } catch (e) {
        const hadCache =
          get().chatsLoadedForUserId === currentUserId && get().chats.length > 0;
        if (hadCache) {
          set({
            error: e instanceof Error ? e.message : "Не удалось обновить чаты",
            isLoading: false,
          });
        } else {
          set({
            error: e instanceof Error ? e.message : "Не удалось загрузить чаты",
            chats: [],
            chatsLoadedForUserId: null,
            isLoading: false,
          });
        }
      } finally {
        loadChatsPromise = null;
        set({ isFetchingChatList: false });
      }
    })();
    await loadChatsPromise;
  },

  loadMessages: async (currentUserId: string, otherUserId: string, silentRefresh = false) => {
    const tid = threadId(currentUserId, otherUserId);

    if (silentRefresh) {
      const chats = get().chats;
      const roomId = resolveRoomIdForThreadPeer(chats, otherUserId);
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      const keys = await getChatKeys();
      if (!keys?.private_key) return;
      void runLoadMessagesInner(
        currentUserId,
        otherUserId,
        roomId,
        tokens.access_token,
        keys,
        tid,
        true,
        get,
        set,
      );
      return;
    }

    if (loadMessagesThreadId === tid && loadMessagesPromise) {
      await loadMessagesPromise;
      return;
    }
    loadMessagesThreadId = tid;
    loadMessagesPromise = (async () => {
      const diskCache =
        typeof window !== "undefined" ? await readThreadMessagesCache(currentUserId, tid) : null;
      try {
        const chats = get().chats;
        let roomId = resolveRoomIdForThreadPeer(chats, otherUserId);

        const tokens = await getValidAuthTokens();
        const otherLower = otherUserId.toLowerCase();
        const otherUser =
          get().users.find((u) => String(u.id).toLowerCase() === otherLower) ||
          chats.find((c) => String(c.otherUser.id).toLowerCase() === otherLower)?.otherUser || {
            id: otherUserId,
            name: displayNameForUserId(otherUserId),
            avatar: null as string | null,
          };
        const activeChatUserResolved =
          typeof otherUser === "object" && "id" in otherUser
            ? {
                id: otherUser.id,
                name: otherUser.name,
                avatar: otherUser.avatar ?? null,
                lastSeenAt: otherUser.lastSeenAt ?? null,
                isOnline: otherUser.isOnline,
              }
            : { id: otherUserId, name: displayNameForUserId(otherUserId), avatar: null };

        if (!tokens?.access_token) {
          cancelPeerTypingAutoClear();
          set({
            activeChatId: tid,
            activeRoomId: roomId ?? diskCache?.roomId ?? null,
            activeChatMessages: (diskCache?.messages as ChatMessage[]) ?? [],
            activeChatNextOffset: diskCache?.activeChatNextOffset ?? 0,
            activeChatHasMoreOlder: diskCache?.activeChatHasMoreOlder ?? false,
            isLoadingOlderMessages: false,
            isMessagesLoading: false,
            error: null,
            activeChatUser: activeChatUserResolved,
            peerTyping: null,
          });
          return;
        }
        if (!roomId) {
          try {
            const rooms = await getRooms(tokens.access_token);
            const room = rooms.find((r) =>
              r.users.some((u) => String(u.id).toLowerCase() === otherLower)
            );
            if (room) roomId = room.id;
          } catch (e) {
            console.warn("getRooms in loadMessages failed:", e);
            roomId = diskCache?.roomId ?? null;
          }
        }

        const effectiveRoomId = roomId ?? diskCache?.roomId ?? null;
        cancelPeerTypingAutoClear();
        set({
          activeChatId: tid,
          activeRoomId: effectiveRoomId,
          activeChatMessages: (diskCache?.messages as ChatMessage[]) ?? [],
          activeChatNextOffset: diskCache?.activeChatNextOffset ?? 0,
          activeChatHasMoreOlder: diskCache?.activeChatHasMoreOlder ?? false,
          isLoadingOlderMessages: false,
          isMessagesLoading: true,
          error: null,
          activeChatUser: activeChatUserResolved,
          peerTyping: null,
        });
        if (effectiveRoomId && chatWebSocket.isConnected()) {
          console.log("[Chat] Вход в чат: room_id=", effectiveRoomId, "otherUser=", otherUserId?.slice(0, 8) + "...");
          chatWebSocket.send({ type: "join_room", data: { room_id: effectiveRoomId } });
        } else if (effectiveRoomId) {
          console.log("[Chat] Вход в чат: room_id=", effectiveRoomId, "— WebSocket не подключён, join_room отправится при подключении");
        }
        const keys = await getChatKeys();
        await runLoadMessagesInner(
          currentUserId,
          otherUserId,
          effectiveRoomId,
          tokens.access_token,
          keys,
          tid,
          false,
          get,
          set,
        );
      } finally {
        if (loadMessagesThreadId === tid) {
          loadMessagesThreadId = null;
          loadMessagesPromise = null;
        }
      }
    })();
    await loadMessagesPromise;
  },

  loadOlderMessages: async (currentUserId: string) => {
    const state = get();
    const otherUser = state.activeChatUser;
    if (!otherUser?.id || !state.activeChatId) return;
    if (state.isLoadingOlderMessages || !state.activeChatHasMoreOlder) return;
    if (state.isMessagesLoading) return;

    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    const keys = await getChatKeys();
    if (!keys?.private_key) return;

    const me = currentUserId.toLowerCase();
    const other = String(otherUser.id).toLowerCase();
    const roomId = state.activeRoomId;
    const tid = state.activeChatId;
    const offset = state.activeChatNextOffset;

    set({ isLoadingOlderMessages: true });
    try {
      const apiMessages = await getMessages(
        tokens.access_token,
        LOAD_OLDER_MESSAGES_LIMIT,
        offset,
        false,
        roomId ?? undefined,
        false,
      );
      const forThisChat = roomId
        ? apiMessages
        : apiMessages.filter((m) => {
            const sid = String(m.sender_id ?? "").toLowerCase();
            const rid = String(m.recipient_id ?? "").toLowerCase();
            return (sid === me && rid === other) || (sid === other && rid === me);
          });

      const decrypted = await buildChatMessagesFromApiResponses(
        forThisChat,
        me,
        tokens.access_token,
        keys,
        tid,
        { get, set },
      );

      const newOffset = offset + apiMessages.length;
      const hasMore = apiMessages.length === LOAD_OLDER_MESSAGES_LIMIT;

      if (get().activeChatId !== tid) return;

      const existingIds = new Set(get().activeChatMessages.map((m) => m.id));
      const olderAdded = decrypted.filter((m) => !existingIds.has(m.id));

      set((s) => ({
        activeChatMessages: [...olderAdded, ...s.activeChatMessages],
        activeChatNextOffset: newOffset,
        activeChatHasMoreOlder: hasMore,
      }));
      queueMicrotask(() => persistActiveThreadSnapshot(get, true));
      if (roomId && olderAdded.length) {
        void mergeReactionsFromBatch(
          tokens.access_token,
          roomId,
          tid,
          olderAdded.map((m) => m.id),
          get,
          set,
        );
      }
    } catch (e) {
      console.warn("loadOlderMessages failed:", e);
    } finally {
      set({ isLoadingOlderMessages: false });
    }
  },

  sendMessage: async (
    currentUserId: string,
    recipientId: string,
    text: string,
    fileParam?: SendMessageFileArg,
    replyTo?: ReplyTo
  ): Promise<ChatMessage | null> => {
    let file: ChatMessageFile | undefined;
    if (fileParam) {
      if ("nativeFile" in fileParam && fileParam.nativeFile) {
        const nf = fileParam.nativeFile;
        const base = fileParam as Partial<ChatMessageFile>;
        file = {
          name: base.name && base.name.trim() !== "" ? base.name : nf.name || "file",
          mimeType: base.mimeType && base.mimeType.trim() !== "" ? base.mimeType : nf.type || "application/octet-stream",
          data: typeof base.data === "string" ? base.data : "",
          nativeFile: nf,
        };
      } else {
        file = fileParam as ChatMessageFile;
      }
    }
    const state = get();
    const recipientLower = recipientId.toLowerCase();
    let roomId =
      state.activeRoomId ??
      state.chats.find((c) => String(c.otherUser.id).toLowerCase() === recipientLower)?.id ??
      null;

    if (!roomId && isGroupThreadPeerId(recipientId)) {
      const tail = recipientId.slice(GROUP_THREAD_PEER_PREFIX.length).trim();
      if (UUID_V4_RE.test(tail)) {
        roomId = tail;
      }
    }

    if (!roomId) {
      set({ isSending: true });
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          set({ isSending: false });
          return null;
        }
        if (isGroupThreadPeerId(recipientId)) {
          set({
            isSending: false,
            error: "Не удалось определить групповую комнату. Обновите список чатов.",
          });
          return null;
        }
        const { room_id } = await createRoom(tokens.access_token, recipientId);
        roomId = room_id;
        set({ activeRoomId: room_id });
        // If WS already connected, immediately join and wait for ack.
        if (chatWebSocket.isConnected()) {
          console.log("[Chat] Вход в чат (новая комната): room_id=", room_id);
          await chatWebSocket.joinRoom(room_id, 2500);
        }
      } catch (e) {
        console.warn("createRoom failed:", e);
        set({ isSending: false, error: e instanceof Error ? e.message : "Не удалось создать чат" });
        return null;
      } finally {
        set({ isSending: false });
      }
    }

    if (!chatWebSocket.isConnected()) {
      set({ isSending: true });
      const connected = await chatWebSocket.waitUntilConnected(6000);
      set({ isSending: false });
      if (!connected) {
        set({ error: "Нет соединения с сервером. Проверьте сеть и попробуйте снова." });
        return null;
      }
      get().rejoinRoomIfNeeded();
    }

    if (roomId) {
      const joined = await chatWebSocket.joinRoom(roomId, 2500);
      if (!joined) {
        // Join failed or not acknowledged; sending may be rejected by server.
        set({ error: "Не удалось войти в чат. Попробуйте ещё раз." });
        return null;
      }
    }

    let payload: Record<string, unknown>;
    let optimisticFileOverride: ChatMessageFile | undefined;
    let optimisticUploadMessageId: string | null = null;

    const setUploadState = (patch: Partial<ChatMessage>) => {
      if (!optimisticUploadMessageId) return;
      set((s) => ({
        activeChatMessages: s.activeChatMessages.map((m) =>
          m.id === optimisticUploadMessageId ? { ...m, ...patch } : m
        ),
      }));
      const chats = get().chats;
      const chatIdx = chats.findIndex((c) => c.lastMessage?.id === optimisticUploadMessageId);
      if (chatIdx >= 0) {
        const last = chats[chatIdx].lastMessage;
        if (!last) return;
        const updatedLast = { ...last, ...patch };
        set({
          chats: chats.map((c, i) => (i === chatIdx ? { ...c, lastMessage: updatedLast } : c)),
        });
      }
    };

    if (file && roomId) {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) {
        set({ error: "Нет авторизации" });
        return null;
      }

      // Показываем сообщение сразу, ещё до загрузки вложения на сервер.
      const optimisticContent: ChatMessageContent = {
        type: "file",
        text: text || undefined,
        file,
        reply_to: replyTo,
      };
      const optimisticStored = appendMessage({
        senderId: currentUserId,
        recipientId,
        content: optimisticContent,
      });
      const optimisticChatMessage: ChatMessage = {
        id: optimisticStored.id,
        senderId: optimisticStored.senderId,
        recipientId: optimisticStored.recipientId,
        content: optimisticStored.content as ChatMessageContent,
        timestamp: optimisticStored.timestamp,
        status: optimisticStored.status,
        isOwn: true,
        isUploading: true,
        uploadProgress: 5,
        uploadError: null,
      };
      optimisticUploadMessageId = optimisticChatMessage.id;
      set((s) => ({
        activeChatMessages: [...s.activeChatMessages, optimisticChatMessage],
      }));

      // Сразу поднимаем текущий чат наверх и показываем optimistic lastMessage.
      const now = new Date().toISOString();
      const chatsBefore = get().chats;
      const chatIdxBefore = chatsBefore.findIndex(
        (c) => c.id === roomId || c.otherUser.id === recipientId
      );
      if (chatIdxBefore >= 0) {
        const chat = chatsBefore[chatIdxBefore];
        const updated: ChatListItem = { ...chat, lastMessage: optimisticChatMessage, updatedAt: now };
        const rest = chatsBefore.filter((_, i) => i !== chatIdxBefore);
        const reordered = [updated, ...rest.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())];
        set({ chats: reordered });
      } else if (state.activeChatUser && state.activeChatUser.id === recipientId) {
        const newChat: ChatListItem = {
          id: roomId!,
          otherUser: state.activeChatUser,
          lastMessage: optimisticChatMessage,
          unreadCount: 0,
          updatedAt: now,
        };
        const reordered = [newChat, ...chatsBefore.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())];
        set({ chats: reordered });
      }

      try {
        setUploadState({ uploadProgress: 15, uploadError: null });
        const inputFile: File =
          file.nativeFile ??
          new File([base64ToBlob(file.data, file.mimeType)], file.name, { type: file.mimeType });
        const prep = await prepareAttachmentForUpload(inputFile);
        setUploadState({ uploadProgress: 35 });
        const encFull = await encryptAttachmentBytes(await prep.full.arrayBuffer());
        const encThumb = prep.thumb ? await encryptAttachmentBytes(await prep.thumb.arrayBuffer()) : null;
        setUploadState({ uploadProgress: 60 });
        const uploaded = await uploadRoomAttachments(
          tokens.access_token,
          roomId,
          new Blob([new Uint8Array(encFull.ciphertext)]),
          `${prep.name}.enc`,
          "application/octet-stream",
          encThumb ? new Blob([new Uint8Array(encThumb.ciphertext)]) : null,
          "thumb.enc",
        );
        setUploadState({ uploadProgress: 85 });
        const fullDataUrl = await blobToDataURL(prep.full);
        let b64 = "";
        try {
          b64 = dataUrlToBase64Payload(fullDataUrl);
        } catch {
          b64 = "";
        }
        const ref: ChatMessageFileRef = {
          attachment_id: uploaded.attachment_id,
          full_key_b64: encFull.key_b64,
          full_nonce_b64: encFull.nonce_b64,
        };
        if (uploaded.thumbnail_attachment_id && encThumb) {
          ref.thumb_attachment_id = uploaded.thumbnail_attachment_id;
          ref.thumb_key_b64 = encThumb.key_b64;
          ref.thumb_nonce_b64 = encThumb.nonce_b64;
        }
        optimisticFileOverride = {
          name: prep.name,
          mimeType: prep.mimeType,
          data: b64,
          file_ref: ref,
        };
        payload = {
          text: text || undefined,
          file_ref: {
            attachment_id: uploaded.attachment_id,
            thumb_attachment_id: uploaded.thumbnail_attachment_id || undefined,
            name: prep.name,
            mimeType: prep.mimeType,
            full_key_b64: encFull.key_b64,
            full_nonce_b64: encFull.nonce_b64,
            thumb_key_b64: encThumb?.key_b64,
            thumb_nonce_b64: encThumb?.nonce_b64,
          },
        };
      } catch (e) {
        setUploadState({
          isUploading: false,
          uploadProgress: undefined,
          uploadError: e instanceof Error ? e.message : "Не удалось загрузить файл",
        });
        set({ error: e instanceof Error ? e.message : "Не удалось загрузить файл" });
        return null;
      }
    } else if (file) {
      payload = { text: text || undefined, file: { name: file.name, mimeType: file.mimeType, data: file.data } };
    } else {
      payload = { text };
    }
    if (replyTo) payload.reply_to = { id: replyTo.id, preview: replyTo.preview };

    const isPemPublicKey = (k: string | undefined | null): k is string =>
      typeof k === "string" && k.includes("BEGIN PUBLIC KEY");

    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) {
      set({ error: "Нет авторизации" });
      return null;
    }

    const chatRowForSend = roomId ? get().chats.find((c) => c.id === roomId) : undefined;
    const isGroupSend =
      isGroupThreadPeerId(recipientId) || chatRowForSend?.roomType === "group";

    const localKeys = await getChatKeys();
    let senderPublicPem = localKeys?.public_key ?? null;
    if (!isPemPublicKey(senderPublicPem)) {
      try {
        const me = await getMyKeypair(tokens.access_token);
        senderPublicPem = me.public_key;
      } catch {
        senderPublicPem = null;
      }
    }
    if (!isPemPublicKey(senderPublicPem)) {
      set({ error: "Не удалось получить ключи шифрования" });
      return null;
    }

    let e2ePayload: Awaited<ReturnType<typeof encryptMessagePayloadForChatService>>;
    if (isGroupSend && roomId) {
      let memberIds = Array.from(
        new Set((chatRowForSend?.groupMembers ?? []).map((m) => String(m.id)))
      );
      if (memberIds.length < 2) {
        try {
          const rooms = await getRooms(tokens.access_token);
          const room = rooms.find((r) => r.id === roomId);
          memberIds = Array.from(new Set((room?.users ?? []).map((u) => String(u.id))));
        } catch {
          memberIds = [];
        }
      }
      if (memberIds.length < 2) {
        set({ error: "Не удалось определить участников группы для шифрования" });
        return null;
      }
      const readerKeys = await Promise.all(
        memberIds.map(async (uid) => {
          const row = await getPublicKey(tokens.access_token, uid);
          return { userId: uid, publicKeyPem: row.public_key };
        })
      );
      if (readerKeys.some((r) => !isPemPublicKey(r.publicKeyPem))) {
        set({ error: "Не удалось получить ключи шифрования" });
        return null;
      }
      e2ePayload = await encryptMessagePayloadForChatService(payload, readerKeys);
    } else {
      const recipientPublic = await getPublicKey(tokens.access_token, recipientId);
      if (!isPemPublicKey(recipientPublic.public_key)) {
        set({ error: "Не удалось получить ключи шифрования" });
        return null;
      }
      e2ePayload = await encryptMessagePayloadForChatService(payload, [
        { userId: recipientId, publicKeyPem: recipientPublic.public_key },
        { userId: currentUserId, publicKeyPem: senderPublicPem },
      ]);
    }

    if (roomId && chatWebSocket.isConnected()) {
      chatWebSocket.send({
        type: "send_message",
        data: {
          room_id: roomId,
          e2e: e2ePayload,
        },
      });
    } else if (roomId) {
      set({ error: "Нет соединения. Сообщение не отправлено." });
      return null;
    }

    const content: ChatMessageContent = file
      ? {
          type: "file",
          text: text || undefined,
          file: optimisticFileOverride ?? file,
          reply_to: replyTo,
        }
      : { type: "text", text, reply_to: replyTo };

    let chatMessage: ChatMessage;
    if (file && optimisticUploadMessageId) {
      // Не добавляем второй раз: обновляем уже показанное optimistic-сообщение.
      const existing = get().activeChatMessages.find((m) => m.id === optimisticUploadMessageId);
      chatMessage = {
        ...(existing ?? {
          id: optimisticUploadMessageId,
          senderId: currentUserId,
          recipientId,
          timestamp: new Date().toISOString(),
          status: "sent" as const,
          isOwn: true,
        }),
        content,
        isUploading: false,
        uploadProgress: undefined,
        uploadError: null,
      };
      set((s) => ({
        activeChatMessages: s.activeChatMessages.map((m) =>
          m.id === optimisticUploadMessageId ? chatMessage : m
        ),
      }));
    } else {
      const newMsg = appendMessage({
        senderId: currentUserId,
        recipientId,
        content,
      });
      chatMessage = {
        id: newMsg.id,
        senderId: newMsg.senderId,
        recipientId: newMsg.recipientId,
        content: newMsg.content as ChatMessageContent,
        timestamp: newMsg.timestamp,
        status: newMsg.status,
        isOwn: true,
      };
      set((s) => ({
        activeChatMessages: [...s.activeChatMessages, chatMessage],
      }));
    }

    // Сразу поднимаем текущий чат наверх и обновляем lastMessage без запроса к API
    const now = new Date().toISOString();
    const chats = get().chats;
    const chatIdx = chats.findIndex(
      (c) => c.id === roomId || c.otherUser.id === recipientId
    );
    if (chatIdx >= 0) {
      const chat = chats[chatIdx];
      const updated: ChatListItem = { ...chat, lastMessage: chatMessage, updatedAt: now };
      const rest = chats.filter((_, i) => i !== chatIdx);
      const reordered = [updated, ...rest.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())];
      set({ chats: reordered });
    } else if (state.activeChatUser && state.activeChatUser.id === recipientId) {
      const newChat: ChatListItem = {
        id: roomId!,
        otherUser: state.activeChatUser,
        lastMessage: chatMessage,
        unreadCount: 0,
        updatedAt: now,
      };
      const reordered = [newChat, ...chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())];
      set({ chats: reordered });
    }

    queueMicrotask(() => persistActiveThreadSnapshot(get, false));
    return chatMessage;
  },

  setActiveChat: (currentUserId: string, otherUser: ChatUser) => {
    console.log("[Chat] Открытие чата: otherUser=", otherUser.id?.slice(0, 8) + "...", otherUser.name);
    get().markAsRead(currentUserId, otherUser.id);
    set((s) => ({
      chats: s.chats.map((c) =>
        c.otherUser.id === otherUser.id ? { ...c, unreadCount: 0 } : c
      ),
    }));
    get().loadMessages(currentUserId, otherUser.id);
  },

  clearActiveChat: () => {
    const state = get();
    if (state.activeRoomId && chatWebSocket.isConnected()) {
      console.log("[Chat] Выход из чата: room_id=", state.activeRoomId);
      chatWebSocket.send({ type: "leave_room", data: { room_id: state.activeRoomId } });
    }
    cancelPeerTypingAutoClear();
    set({
      activeChatId: null,
      activeRoomId: null,
      activeChatMessages: [],
      activeChatNextOffset: 0,
      activeChatHasMoreOlder: false,
      isLoadingOlderMessages: false,
      activeChatUser: null,
      peerTyping: null,
    });
  },

  setPeerTyping: (roomId, userId, isTyping) => {
    const rid = String(roomId || "").trim();
    const uid = String(userId || "").trim();
    if (!rid || !uid) return;
    if (!isTyping) {
      cancelPeerTypingAutoClear();
      set((s) => {
        const p = s.peerTyping;
        if (!p || p.roomId !== rid || p.userId !== uid) return {};
        return { peerTyping: null };
      });
      return;
    }
    set({ peerTyping: { roomId: rid, userId: uid, until: Date.now() + 4000 } });
    schedulePeerTypingAutoClear(rid, uid, get, set);
  },

  addIncomingWsMessage: (payload) => {
    const senderId = String(payload.sender_id ?? "");
    const recipientId = payload.recipient_id != null ? String(payload.recipient_id) : null;
    const roomId = payload.room_id != null ? String(payload.room_id) : null;
    const messageId = String(payload.message_id ?? "");
    const currentUserId = payload.currentUserId;
    if (!messageId) return;
    const state = get();
    const otherUserId = state.activeChatUser?.id;
    const isForActiveChat =
      !!otherUserId &&
      (senderId === otherUserId || recipientId === otherUserId || (roomId != null && state.activeRoomId === roomId));
    const alreadyInActive = state.activeChatMessages.some((m) => m.id === messageId);

    void (async () => {
      const tokens = await getValidAuthTokens();
      const keys = await getChatKeys();
      if (!tokens?.access_token || !keys?.private_key) return;
      const full = await getMessage(tokens.access_token, messageId);
      if (!full) return;
      const me = currentUserId.toLowerCase();
      const content = await decryptMessage(
        full.encrypted_data,
        full.encrypted_aes_key,
        full.nonce,
        keys.private_key,
      );
      if (!content) return;
      const messageContent = buildMessageContentFromDecrypt(content as Record<string, unknown> | null);
      const isOwnMsg = String(full.sender_id).toLowerCase() === me;
      const recipientLower = full.recipient_id ? String(full.recipient_id).toLowerCase() : "";
      const isIncomingToMe = !isOwnMsg && recipientLower === me;

      let displayStatus: ChatMessage["status"] = full.is_read ? "read" : "delivered";
      if (isForActiveChat && isIncomingToMe && !full.is_read) {
        try {
          await markMessageAsRead(tokens.access_token, messageId);
          displayStatus = "read";
        } catch {
          /* сеть/404 — оставляем статус из full */
        }
      }

      const newMsg: ChatMessage = {
        id: messageId,
        senderId: String(full.sender_id),
        recipientId: full.recipient_id ?? "",
        content: messageContent,
        timestamp: full.sent_at,
        status: displayStatus,
        isOwn: isOwnMsg,
      };

      const chatState = get();
      const senderLower = senderId.toLowerCase();
      const chatIdx = chatState.chats.findIndex(
        (c) =>
          String(c.otherUser.id).toLowerCase() === senderLower ||
          (roomId && String(c.id).toLowerCase() === String(roomId).toLowerCase()),
      );
      if (chatIdx >= 0) {
        const chat = chatState.chats[chatIdx];
        const unreadDelta = isForActiveChat ? 0 : 1;
        const updated: ChatListItem = {
          ...chat,
          lastMessage: newMsg,
          updatedAt: newMsg.timestamp,
          unreadCount: (chat.unreadCount ?? 0) + unreadDelta,
        };
        const replaced = chatState.chats.map((c, i) => (i === chatIdx ? updated : c));
        set({ chats: replaced.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) });
      } else {
        void get().loadChats(currentUserId);
      }

      if (isForActiveChat && !alreadyInActive) {
        const next = get().activeChatMessages;
        if (!next.some((m) => m.id === messageId)) {
          const merged = [...next, newMsg].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
          set({ activeChatMessages: merged });
          queueMicrotask(() => persistActiveThreadSnapshot(get, false));
        }
      }
      if (roomId && full.sender_id) {
        get().setPeerTyping(roomId, String(full.sender_id), false);
      }
    })();
  },

  markAsRead: (currentUserId: string, otherUserId: string) => {
    markThreadAsRead(currentUserId, otherUserId);
    set((s) => ({
      activeChatMessages: s.activeChatMessages.map((m) =>
        m.senderId === otherUserId ? { ...m, status: "read" as const } : m
      ),
    }));
  },

  removeChatByRoomId: (roomId: string) => {
    const id = String(roomId || "");
    if (!id) return;
    set((s) => ({ chats: s.chats.filter((c) => String(c.id) !== id) }));
  },

  rejoinRoomIfNeeded: () => {
    const state = get();
    if (state.activeRoomId && chatWebSocket.isConnected()) {
      console.log("[Chat] Повторный вход в комнату после подключения WebSocket: room_id=", state.activeRoomId);
      chatWebSocket.send({ type: "join_room", data: { room_id: state.activeRoomId } });
    }
  },

  updateSentMessage: (messageId: string, sentAt: string) => {
    const list = get().activeChatMessages;
    let idx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].isOwn && list[i].id.startsWith("msg_")) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    const prev = list[idx];
    const nextStatus: ChatMessage["status"] = prev.status === "read" ? "read" : "delivered";
    const updated: ChatMessage = { ...prev, id: messageId, timestamp: sentAt, status: nextStatus };
    set({
      activeChatMessages: list.map((msg, i) => (i === idx ? updated : msg)),
    });
    queueMicrotask(() => persistActiveThreadSnapshot(get, false));
    const chats = get().chats;
    const chatIdx = chats.findIndex((c) => c.lastMessage?.id === prev.id);
    if (chatIdx >= 0) {
      const lm = chats[chatIdx].lastMessage;
      set({
        chats: chats.map((c, i) => {
          if (i !== chatIdx || !lm) return c;
          const nextStatus: ChatMessage["status"] =
            lm.isOwn && lm.status !== "read" ? "delivered" : lm.status;
          return {
            ...c,
            lastMessage: { ...lm, id: messageId, timestamp: sentAt, status: nextStatus },
          };
        }),
      });
    }
  },

  markOwnMessageReadByPeer: (messageId: string) => {
    const id = String(messageId || "");
    if (!id) return;
    set((s) => ({
      activeChatMessages: s.activeChatMessages.map((m) =>
        m.id === id && m.isOwn ? { ...m, status: "read" as const } : m
      ),
      chats: s.chats.map((c) => {
        const lm = c.lastMessage;
        if (lm && lm.id === id && lm.isOwn) {
          return { ...c, lastMessage: { ...lm, status: "read" as const } };
        }
        return c;
      }),
    }));
  },

  removeMessageFromActiveChat: (messageId: string) => {
    const id = String(messageId || "");
    if (!id) return;
    set((s) => {
      const nextMsgs = s.activeChatMessages.filter((m) => m.id !== id);
      const latest =
        nextMsgs.length === 0
          ? null
          : [...nextMsgs].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            )[0];
      const chats = s.chats.map((c) => {
        if (c.lastMessage?.id !== id) return c;
        return {
          ...c,
          lastMessage: latest,
          updatedAt: latest?.timestamp ?? c.updatedAt,
        };
      });
      return { activeChatMessages: nextMsgs, chats };
    });
    queueMicrotask(() => persistActiveThreadSnapshot(get, false));
  },

  applyMessageReaction: ({ roomId, messageId, userId, emoji, removed }) => {
    const rid = String(roomId || "").trim();
    const mid = String(messageId || "").trim();
    if (!rid || !mid) return;
    set((s) => {
      const nextChats = s.chats.map((c) => {
        if (c.id !== rid || !c.lastMessage || c.lastMessage.id !== mid) return c;
        return {
          ...c,
          lastMessage: patchMessageReactions(c.lastMessage, mid, userId, emoji, removed),
        };
      });
      if (String(s.activeRoomId ?? "") !== rid) {
        return { chats: nextChats };
      }
      return {
        activeChatMessages: s.activeChatMessages.map((m) =>
          patchMessageReactions(m, mid, userId, emoji, removed),
        ),
        chats: nextChats,
      };
    });
    if (String(get().activeRoomId ?? "") === rid) {
      queueMicrotask(() => persistActiveThreadSnapshot(get, false));
    }
  },

  applyRoomMemberRemoved: (roomId, removedUserId, currentUserId) => {
    const rid = String(roomId || "").trim();
    const uid = String(removedUserId || "").trim().toLowerCase();
    const me = String(currentUserId || "").trim().toLowerCase();
    if (!rid || !uid || !me) return;
    if (uid === me) {
      get().removeChatByRoomId(rid);
      if (get().activeRoomId === rid) get().clearActiveChat();
      return;
    }
    void get().loadChats(currentUserId, { force: true });
  },

  updatePeerPresence: (userId: string, online: boolean, atIso?: string) => {
    const idLower = userId.trim().toLowerCase();
    if (!idLower) return;
    set((s) => {
      const patchUser = (u: ChatUser): ChatUser => ({
        ...u,
        isOnline: online,
        lastSeenAt:
          online
            ? u.lastSeenAt
            : atIso != null && String(atIso).trim() !== ""
              ? String(atIso)
              : u.lastSeenAt,
      });
      const activeChatUser =
        s.activeChatUser && String(s.activeChatUser.id).toLowerCase() === idLower
          ? patchUser(s.activeChatUser)
          : s.activeChatUser;
      const chats = s.chats.map((c) =>
        String(c.otherUser.id).toLowerCase() === idLower ? { ...c, otherUser: patchUser(c.otherUser) } : c
      );
      return { activeChatUser, chats };
    });
  },
}));
