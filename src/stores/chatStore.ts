"use client";

import { create } from "zustand";
import { getAuthTokens } from "@/lib/secureStorage";
import { getRooms } from "@/services/chatRoomsApi";
import {
  getMessagesForThread,
  appendMessage,
  markThreadAsRead,
  getDemoUsers,
  type StoredMessage,
} from "@/lib/storage";

export interface ChatUser {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: { type: "text"; text: string };
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

function displayNameForUserId(userId: string): string {
  const short = String(userId).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}

interface ChatState {
  users: ChatUser[];
  chats: ChatListItem[];
  activeChatId: string | null;
  activeChatMessages: ChatMessage[];
  activeChatUser: ChatUser | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  loadUsers: () => void;
  loadChats: (currentUserId: string) => Promise<void>;
  loadMessages: (currentUserId: string, otherUserId: string) => void;
  sendMessage: (currentUserId: string, recipientId: string, text: string) => ChatMessage | null;
  setActiveChat: (currentUserId: string, otherUser: ChatUser) => void;
  clearActiveChat: () => void;
  markAsRead: (currentUserId: string, otherUserId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  users: [],
  chats: [],
  activeChatId: null,
  activeChatMessages: [],
  activeChatUser: null,
  isLoading: false,
  isSending: false,
  error: null,

  loadUsers: () => {
    const list = getDemoUsers().map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }));
    set({ users: list });
  },

  loadChats: async (currentUserId: string) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await getAuthTokens();
      if (!tokens?.access_token) {
        set({ chats: [], isLoading: false });
        return;
      }
      const rooms = await getRooms(tokens.access_token);
      const currentId = String(currentUserId).toLowerCase();

      const chats: ChatListItem[] = rooms
        .map((room) => {
          const other = room.users.find((u) => String(u.id).toLowerCase() !== currentId);
          if (!other) return null;
          const parts = [other.last_name, other.first_name, other.middle_name].filter(Boolean) as string[];
          const displayName = parts.length > 0 ? parts.join(" ").trim() : (room.name || displayNameForUserId(other.id));
          const otherUser: ChatUser = {
            id: other.id,
            name: displayName,
            avatar: other.avatar ?? null,
          };
          return {
            id: room.id,
            otherUser,
            lastMessage: null,
            unreadCount: 0,
            updatedAt: room.created_at,
          };
        })
        .filter((c): c is ChatListItem => c !== null);

      set({
        chats: chats.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
        isLoading: false,
        error: null,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Не удалось загрузить чаты",
        chats: [],
        isLoading: false,
      });
    }
  },

  loadMessages: (currentUserId: string, otherUserId: string) => {
    const raw = getMessagesForThread(currentUserId, otherUserId);
    const activeChatMessages: ChatMessage[] = raw
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m: StoredMessage) => ({
        id: m.id,
        senderId: m.senderId,
        recipientId: m.recipientId,
        content: m.content?.type === "text" ? m.content : { type: "text" as const, text: "" },
        timestamp: m.timestamp,
        status: m.status,
        isOwn: m.senderId === currentUserId,
      }));
    const otherUser =
      get().users.find((u) => u.id === otherUserId) ||
      get().chats.find((c) => c.otherUser.id === otherUserId)?.otherUser || {
        id: otherUserId,
        name: displayNameForUserId(otherUserId),
        avatar: null as string | null,
      };
    set({
      activeChatId: threadId(currentUserId, otherUserId),
      activeChatMessages,
      activeChatUser:
        typeof otherUser === "object" && "id" in otherUser
          ? { id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar ?? null }
          : { id: otherUserId, name: displayNameForUserId(otherUserId), avatar: null },
    });
  },

  sendMessage: (currentUserId: string, recipientId: string, text: string) => {
    const newMsg = appendMessage({
      senderId: currentUserId,
      recipientId,
      content: { type: "text", text },
    });
    const chatMessage: ChatMessage = {
      id: newMsg.id,
      senderId: newMsg.senderId,
      recipientId: newMsg.recipientId,
      content: newMsg.content as { type: "text"; text: string },
      timestamp: newMsg.timestamp,
      status: newMsg.status,
      isOwn: true,
    };
    set((s) => ({
      activeChatMessages: [...s.activeChatMessages, chatMessage],
    }));
    get().loadChats(currentUserId);
    return chatMessage;
  },

  setActiveChat: (currentUserId: string, otherUser: ChatUser) => {
    get().markAsRead(currentUserId, otherUser.id);
    get().loadMessages(currentUserId, otherUser.id);
    get().loadChats(currentUserId);
  },

  clearActiveChat: () => {
    set({
      activeChatId: null,
      activeChatMessages: [],
      activeChatUser: null,
    });
  },

  markAsRead: (currentUserId: string, otherUserId: string) => {
    markThreadAsRead(currentUserId, otherUserId);
    set((s) => ({
      activeChatMessages: s.activeChatMessages.map((m) =>
        m.senderId === otherUserId ? { ...m, status: "read" as const } : m
      ),
    }));
    get().loadChats(currentUserId);
  },
}));
