"use client";

import { create } from "zustand";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys } from "@/lib/secureStorage";
import { getRooms, createRoom } from "@/services/chatRoomsApi";
import { getMessages, getMessage } from "@/services/chatMessagesApi";
import { decryptMessage } from "@/lib/decryptMessage";
import { chatWebSocket } from "@/services/chatWebSocket";
import {
  appendMessage,
  markThreadAsRead,
  getDemoUsers,
} from "@/lib/storage";

export interface ChatUser {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface ChatMessageFile {
  name: string;
  mimeType: string;
  data: string; // base64
}

/** Ссылка на сообщение, на которое отвечаем (хранится в теле сообщения, без изменений БД). */
export interface ReplyTo {
  id: string;
  preview: string;
}

export type ChatMessageContent =
  | { type: "text"; text: string; reply_to?: ReplyTo }
  | { type: "file"; text?: string; file: ChatMessageFile; reply_to?: ReplyTo };

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: ChatMessageContent;
  timestamp: string;
  status: "sent" | "delivered" | "read";
  isOwn: boolean;
}

export interface ChatListItem {
  id: string;
  otherUser: ChatUser;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
}

function threadId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

let loadChatsPromise: Promise<void> | null = null;
let loadMessagesPromise: Promise<void> | null = null;
let loadMessagesThreadId: string | null = null;

const INITIAL_MESSAGES_LIMIT = 50;

function displayNameForUserId(userId: string): string {
  const short = String(userId).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}

async function runLoadMessagesInner(
  currentUserId: string,
  otherUserId: string,
  roomId: string | null,
  accessToken: string,
  keys: { private_key: string } | null,
  tid: string,
  silentRefresh: boolean,
  get: () => { activeChatId: string | null },
  set: (s: Partial<ChatState> | ((prev: ChatState) => Partial<ChatState>)) => void,
): Promise<void> {
  const me = currentUserId.toLowerCase();
  const other = otherUserId.toLowerCase();
  try {
    const apiMessages = await getMessages(
      accessToken,
      INITIAL_MESSAGES_LIMIT,
      0,
      false,
      roomId ?? undefined,
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
        set({
          activeChatMessages: [],
          isMessagesLoading: false,
          error: "Нет ключа расшифровки. Войдите заново или зарегистрируйтесь в приложении.",
        });
      }
      return;
    }

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
        const text = content?.text ?? "";
        const filePayload = content?.file as { name?: string; mimeType?: string; data?: string } | undefined;
        const hasFile = filePayload && typeof filePayload.name === "string" && typeof filePayload.data === "string";
        const rawReplyTo = content?.reply_to as { id?: string; preview?: string } | undefined;
        const replyTo: ReplyTo | undefined =
          rawReplyTo && typeof rawReplyTo.id === "string" && typeof rawReplyTo.preview === "string"
            ? { id: rawReplyTo.id, preview: rawReplyTo.preview }
            : undefined;
        const messageContent: ChatMessageContent = hasFile
          ? {
              type: "file",
              text: text || undefined,
              file: {
                name: filePayload!.name ?? "file",
                mimeType: typeof filePayload!.mimeType === "string" ? filePayload!.mimeType : "application/octet-stream",
                data: filePayload!.data!,
              },
              reply_to: replyTo,
            }
          : { type: "text", text, reply_to: replyTo };
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

    const loadedForThread = threadId(currentUserId, otherUserId);
    if (get().activeChatId === loadedForThread) {
      set({ activeChatMessages: decrypted, isMessagesLoading: false, error: null });
    } else {
      set({ isMessagesLoading: false });
    }

    if (needFullFetch.length === 0) return;

    needFullFetch.forEach((m) => {
      const messageId = String(m.message_id);
      getMessage(accessToken, messageId).then((full) => {
        if (!full || get().activeChatId !== loadedForThread) return;
        decryptMessage(
          full.encrypted_data,
          full.encrypted_aes_key,
          full.nonce,
          keys!.private_key,
        ).then((content) => {
          if (!content || get().activeChatId !== loadedForThread) return;
          const text = content?.text ?? "";
          const filePayload = content?.file as { name?: string; mimeType?: string; data?: string } | undefined;
          const hasFile = filePayload && typeof filePayload.name === "string" && typeof filePayload.data === "string";
          const rawReplyTo = content?.reply_to as { id?: string; preview?: string } | undefined;
          const replyTo: ReplyTo | undefined =
            rawReplyTo && typeof rawReplyTo.id === "string" && typeof rawReplyTo.preview === "string"
              ? { id: rawReplyTo.id, preview: rawReplyTo.preview }
              : undefined;
          const messageContent: ChatMessageContent = hasFile
            ? {
                type: "file",
                text: text || undefined,
                file: {
                  name: filePayload!.name ?? "file",
                  mimeType: typeof filePayload!.mimeType === "string" ? filePayload!.mimeType : "application/octet-stream",
                  data: filePayload!.data!,
                },
                reply_to: replyTo,
              }
            : { type: "text", text, reply_to: replyTo };
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
        }).catch(() => {});
      });
    });
  } catch (e) {
    console.warn("loadMessages from API failed:", e);
    if (!silentRefresh) {
      set({
        activeChatMessages: [],
        isMessagesLoading: false,
        error: e instanceof Error ? e.message : "Не удалось загрузить сообщения",
      });
    }
  }
}

interface ChatState {
  users: ChatUser[];
  chats: ChatListItem[];
  activeChatId: string | null;
  activeRoomId: string | null;
  activeChatMessages: ChatMessage[];
  activeChatUser: ChatUser | null;
  isLoading: boolean;
  isMessagesLoading: boolean;
  isSending: boolean;
  error: string | null;
  loadUsers: () => void;
  loadChats: (currentUserId: string) => Promise<void>;
  loadMessages: (currentUserId: string, otherUserId: string, silentRefresh?: boolean) => Promise<void>;
  sendMessage: (
    currentUserId: string,
    recipientId: string,
    text: string,
    file?: ChatMessageFile,
    replyTo?: ReplyTo
  ) => Promise<ChatMessage | null>;
  setActiveChat: (currentUserId: string, otherUser: ChatUser) => void;
  clearActiveChat: () => void;
  markAsRead: (currentUserId: string, otherUserId: string) => void;
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
}

export const useChatStore = create<ChatState>((set, get) => ({
  users: [],
  chats: [],
  activeChatId: null,
  activeRoomId: null,
  activeChatMessages: [],
  activeChatUser: null,
  isLoading: false,
  isMessagesLoading: false,
  isSending: false,
  error: null,

  loadUsers: () => {
    const list = getDemoUsers().map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }));
    set({ users: list });
  },

  loadChats: async (currentUserId: string) => {
    if (loadChatsPromise) {
      await loadChatsPromise;
      return;
    }
    loadChatsPromise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          set({ chats: [], isLoading: false });
          return;
        }
        const currentId = currentUserId.toLowerCase();
        const keys = await getChatKeys();
        const rooms = await getRooms(tokens.access_token);
        const prevChats = get().chats;
        console.log(keys)

        const chatsWithLastMessage = await Promise.all(
          rooms.map(async (room): Promise<ChatListItem | null> => {
            const other = room.users.find((u) => String(u.id).toLowerCase() !== currentId);
            if (!other) return null;
            const parts = [other.last_name, other.first_name, other.middle_name].filter(Boolean) as string[];
            const displayName = parts.length > 0 ? parts.join(" ").trim() : (room.name || displayNameForUserId(other.id));
            const otherUser: ChatUser = {
              id: other.id,
              name: displayName,
              avatar: other.avatar ?? null,
            };
            const prev = prevChats.find((c) => c.id === room.id || c.otherUser.id === other.id);
            let lastMessage: ChatMessage | null = null;
            let updatedAt = room.created_at ?? new Date().toISOString();
            if (room.last_message && keys?.private_key) {
              const lm = room.last_message;
              const content = await decryptMessage(
                lm.encrypted_data,
                lm.encrypted_aes_key,
                lm.nonce,
                keys.private_key
              );
              const text = content?.text ?? "";
              const file = (content as { file?: { name?: string } })?.file;
              const fileName = file && typeof file.name === "string" ? file.name : null;
              const messageContent: ChatMessageContent =
                fileName != null
                  ? {
                      type: "file",
                      text: text || undefined,
                      file: { name: fileName, mimeType: "application/octet-stream", data: "" },
                    }
                  : { type: "text", text };
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
              unreadCount: prev?.unreadCount ?? 0,
              updatedAt,
            };
          })
        );

        const chats = chatsWithLastMessage
          .filter((c): c is ChatListItem => c !== null)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        set({ chats, isLoading: false, error: null });

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
        set({
          error: e instanceof Error ? e.message : "Не удалось загрузить чаты",
          chats: [],
          isLoading: false,
        });
      } finally {
        loadChatsPromise = null;
      }
    })();
    await loadChatsPromise;
  },

  loadMessages: async (currentUserId: string, otherUserId: string, silentRefresh = false) => {
    const tid = threadId(currentUserId, otherUserId);

    if (silentRefresh) {
      const chats = get().chats;
      const roomId = chats.find((c) => c.otherUser.id === otherUserId)?.id ?? null;
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
      try {
        const otherLower = otherUserId.toLowerCase();
        const chats = get().chats;
        let roomId = chats.find((c) => String(c.otherUser.id).toLowerCase() === otherLower)?.id ?? null;

        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          set({ activeChatMessages: [], isMessagesLoading: false });
          return;
        }
        if (!roomId) {
          const rooms = await getRooms(tokens.access_token);
          const room = rooms.find((r) =>
            r.users.some((u) => String(u.id).toLowerCase() === otherLower)
          );
          if (room) roomId = room.id;
        }

        const otherUser =
          get().users.find((u) => String(u.id).toLowerCase() === otherLower) ||
          chats.find((c) => String(c.otherUser.id).toLowerCase() === otherLower)?.otherUser || {
            id: otherUserId,
            name: displayNameForUserId(otherUserId),
            avatar: null as string | null,
          };
        set({
          activeChatId: tid,
          activeRoomId: roomId,
          activeChatMessages: [],
          isMessagesLoading: true,
          error: null,
          activeChatUser:
            typeof otherUser === "object" && "id" in otherUser
              ? { id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar ?? null }
              : { id: otherUserId, name: displayNameForUserId(otherUserId), avatar: null },
        });
        if (roomId && chatWebSocket.isConnected()) {
          console.log("[Chat] Вход в чат: room_id=", roomId, "otherUser=", otherUserId?.slice(0, 8) + "...");
          chatWebSocket.send({ type: "join_room", data: { room_id: roomId } });
        } else if (roomId) {
          console.log("[Chat] Вход в чат: room_id=", roomId, "— WebSocket не подключён, join_room отправится при подключении");
        }
        const keys = await getChatKeys();
        await runLoadMessagesInner(
          currentUserId,
          otherUserId,
          roomId,
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

  sendMessage: async (
    currentUserId: string,
    recipientId: string,
    text: string,
    file?: ChatMessageFile,
    replyTo?: ReplyTo
  ): Promise<ChatMessage | null> => {
    const state = get();
    const recipientLower = recipientId.toLowerCase();
    let roomId =
      state.activeRoomId ??
      state.chats.find((c) => String(c.otherUser.id).toLowerCase() === recipientLower)?.id ??
      null;

    if (!roomId) {
      set({ isSending: true });
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          set({ isSending: false });
          return null;
        }
        const { room_id } = await createRoom(tokens.access_token, recipientId);
        roomId = room_id;
        set({ activeRoomId: room_id });
        if (chatWebSocket.isConnected()) {
          console.log("[Chat] Вход в чат (новая комната): room_id=", room_id);
          chatWebSocket.send({ type: "join_room", data: { room_id } });
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
      chatWebSocket.send({ type: "join_room", data: { room_id: roomId } });
      await new Promise((r) => setTimeout(r, 50));
    }

    const payload: Record<string, unknown> = file
      ? { text: text || undefined, file: { name: file.name, mimeType: file.mimeType, data: file.data } }
      : { text };
    if (replyTo) payload.reply_to = { id: replyTo.id, preview: replyTo.preview };

    if (roomId && chatWebSocket.isConnected()) {
      chatWebSocket.send({
        type: "send_message",
        data: {
          room_id: roomId,
          message: payload,
        },
      });
    } else if (roomId) {
      set({ error: "Нет соединения. Сообщение не отправлено." });
      return null;
    }

    const content: ChatMessageContent = file
      ? { type: "file", text: text || undefined, file, reply_to: replyTo }
      : { type: "text", text, reply_to: replyTo };
    const newMsg = appendMessage({
      senderId: currentUserId,
      recipientId,
      content,
    });
    const chatMessage: ChatMessage = {
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
    set({
      activeChatId: null,
      activeRoomId: null,
      activeChatMessages: [],
      activeChatUser: null,
    });
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
      const text = content?.text ?? "";
      const filePayload = content?.file as { name?: string; mimeType?: string; data?: string } | undefined;
      const hasFile = filePayload && typeof filePayload.name === "string" && typeof filePayload.data === "string";
      const rawReplyTo = content?.reply_to as { id?: string; preview?: string } | undefined;
      const replyTo: ReplyTo | undefined =
        rawReplyTo && typeof rawReplyTo.id === "string" && typeof rawReplyTo.preview === "string"
          ? { id: rawReplyTo.id, preview: rawReplyTo.preview }
          : undefined;
      const messageContent: ChatMessageContent = hasFile
        ? {
            type: "file",
            text: text || undefined,
            file: {
              name: filePayload!.name ?? "file",
              mimeType: typeof filePayload!.mimeType === "string" ? filePayload!.mimeType : "application/octet-stream",
              data: filePayload!.data!,
            },
            reply_to: replyTo,
          }
        : { type: "text", text, reply_to: replyTo };
      const newMsg: ChatMessage = {
        id: messageId,
        senderId: String(full.sender_id),
        recipientId: full.recipient_id ?? "",
        content: messageContent,
        timestamp: full.sent_at,
        status: "delivered",
        isOwn: String(full.sender_id).toLowerCase() === me,
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
        }
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
    const updated = { ...prev, id: messageId, timestamp: sentAt };
    set({
      activeChatMessages: list.map((msg, i) => (i === idx ? updated : msg)),
    });
    const chats = get().chats;
    const chatIdx = chats.findIndex((c) => c.lastMessage?.id === prev.id);
    if (chatIdx >= 0) {
      const chat = chats[chatIdx];
      set({
        chats: chats.map((c, i) =>
          i === chatIdx ? { ...c, lastMessage: { ...c.lastMessage!, id: messageId, timestamp: sentAt } } : c
        ),
      });
    }
  },
}));
