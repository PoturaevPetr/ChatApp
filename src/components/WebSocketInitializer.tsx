"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useChatStore } from "@/stores/chatStore";
import { chatWebSocket } from "@/services/chatWebSocket";
import { getValidAuthTokens } from "@/lib/validAuthToken";

/**
 * Подключает WebSocket к ChatService при наличии авторизации.
 * Подписывается на new_message и message_sent, обновляет chatStore.
 */
export function WebSocketInitializer() {
  const { user, isAuthenticated } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();
  const addIncomingWsMessage = useChatStore((s) => s.addIncomingWsMessage);
  const updateSentMessage = useChatStore((s) => s.updateSentMessage);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      if (connectedRef.current) {
        disconnect();
        connectedRef.current = false;
      }
      return;
    }

    let cancelled = false;
    getValidAuthTokens().then((tokens) => {
      if (cancelled || !tokens?.access_token) return;
      connect(user.id, tokens.access_token);
      connectedRef.current = true;
    });

    return () => {
      cancelled = true;
      // Не вызываем disconnect() при размонтировании/перезапуске эффекта — иначе при
      // навигации (список → чат) сокет закрывается и открывается заново, join_room не успевает.
      // Разрыв только при выходе (см. блок выше: !isAuthenticated || !user?.id).
      connectedRef.current = false;
    };
  }, [isAuthenticated, user?.id, connect, disconnect]);

  useEffect(() => {
    if (!user?.id) return;

    const unsub = chatWebSocket.onMessage((message) => {
      const data = message.data as Record<string, unknown> | undefined;
      if (message.type === "room_joined" && data) {
        console.log("[Chat] Сервер подтвердил вход в комнату: room_id=", (data as { room_id?: string }).room_id);
      }
      if (message.type === "message_sent" && data) {
        const payload = data as { message_id?: string; sent_at?: string };
        if (payload.message_id && payload.sent_at) {
          updateSentMessage(String(payload.message_id), String(payload.sent_at));
        }
      }
      if (message.type === "new_message" && data) {
        const payload = data as {
          message_id?: string;
          sender_id?: string;
          recipient_id?: string | null;
          room_id?: string | null;
          encrypted_data?: string;
        };
        addIncomingWsMessage({
          message_id: String(payload.message_id ?? ""),
          sender_id: String(payload.sender_id ?? ""),
          recipient_id: payload.recipient_id != null ? String(payload.recipient_id) : null,
          room_id: payload.room_id != null ? String(payload.room_id) : null,
          currentUserId: user.id,
        });
      }
    });

    return () => {
      unsub();
    };
  }, [user?.id, addIncomingWsMessage, updateSentMessage]);

  return null;
}
