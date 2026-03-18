"use client";

import { create } from "zustand";
import { chatWebSocket } from "@/services/chatWebSocket";
import { useChatStore } from "@/stores/chatStore";

interface WebSocketState {
  isConnected: boolean;
  connect: (userId: string, accessToken: string) => void;
  disconnect: () => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,

  connect: (userId: string, accessToken: string) => {
    chatWebSocket.connect(userId, accessToken, {
      onOpen: () => {
        set({ isConnected: true });
        useChatStore.getState().rejoinRoomIfNeeded();
      },
      onClose: () => set({ isConnected: false }),
    });
  },

  disconnect: () => {
    chatWebSocket.disconnect();
    set({ isConnected: false });
  },
}));
