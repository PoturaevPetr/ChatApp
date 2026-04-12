"use client";

import { create } from "zustand";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { chatWebSocket } from "@/services/chatWebSocket";
import { useChatStore } from "@/stores/chatStore";

interface WebSocketState {
  isConnected: boolean;
  connect: (userId: string, accessToken: string) => void;
  disconnect: () => void;
  ensureConnected: (userId: string) => Promise<void>;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,

  ensureConnected: async (userId: string) => {
    if (!userId) return;
    if (chatWebSocket.isConnected()) return;
    if (chatWebSocket.isConnecting()) return;
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    // За время await другой вызов мог уже подключиться.
    if (chatWebSocket.isConnected()) return;
    if (chatWebSocket.isConnecting()) return;
    get().connect(userId, tokens.access_token);
  },

  connect: (userId: string, accessToken: string) => {
    chatWebSocket.connect(userId, accessToken, {
      onOpen: () => {
        set({ isConnected: true });
        const chat = useChatStore.getState();
        chat.rejoinRoomIfNeeded();
        void chat.loadChats(userId);
      },
      onClose: () => set({ isConnected: false }),
    });
  },

  disconnect: () => {
    chatWebSocket.disconnect();
    set({ isConnected: false });
  },
}));
