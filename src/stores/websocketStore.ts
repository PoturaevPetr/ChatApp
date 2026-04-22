"use client";

import { create } from "zustand";
import { Capacitor } from "@capacitor/core";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { chatWebSocket } from "@/services/chatWebSocket";
import { useChatStore } from "@/stores/chatStore";

interface WebSocketState {
  isConnected: boolean;
  connect: (userId: string, accessToken: string) => void;
  disconnect: () => void;
  ensureConnected: (userId: string) => Promise<void>;
  /**
   * После разблокировки / возврата из фона на мобильном WebSocket часто мёртвый при readyState OPEN,
   * либо уже закрыт без переподключения. На нативе — принудительный disconnect + connect; в браузере —
   * только если сокет не открыт.
   */
  syncConnectionAfterForeground: (userId: string) => Promise<void>;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,

  ensureConnected: async (userId: string) => {
    if (!userId) return;
    if (chatWebSocket.isConnected()) return;
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    if (chatWebSocket.isConnected()) return;
    // «Вечный» CONNECTING после смены сети — обрываем и подключаемся заново
    if (chatWebSocket.isConnecting()) {
      chatWebSocket.disconnect();
      set({ isConnected: false });
    }
    if (chatWebSocket.isConnected()) return;
    if (chatWebSocket.isConnecting()) return;
    get().connect(userId, tokens.access_token);
  },

  syncConnectionAfterForeground: async (userId: string) => {
    if (!userId) return;
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    const native = Capacitor.isNativePlatform();
    if (native) {
      chatWebSocket.disconnect();
      set({ isConnected: false });
      get().connect(userId, tokens.access_token);
      return;
    }
    if (chatWebSocket.isConnecting()) {
      chatWebSocket.disconnect();
      set({ isConnected: false });
    }
    if (!chatWebSocket.isConnected()) {
      get().connect(userId, tokens.access_token);
    }
  },

  connect: (userId: string, accessToken: string) => {
    chatWebSocket.connect(userId, accessToken, {
      onOpen: () => {
        set({ isConnected: true });
        const chat = useChatStore.getState();
        chat.rejoinRoomIfNeeded();
        // loadChats вызывается до connect (см. WebSocketInitializer), чтобы кэш/HTTP не ждали сокет.
      },
      onClose: () => set({ isConnected: false }),
    });
  },

  disconnect: () => {
    chatWebSocket.disconnect();
    set({ isConnected: false });
  },
}));
