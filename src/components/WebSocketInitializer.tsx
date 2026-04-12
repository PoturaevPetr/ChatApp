"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useChatStore } from "@/stores/chatStore";
import { chatWebSocket } from "@/services/chatWebSocket";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { playSoftMessageSound, primeNotificationAudio } from "@/utils/notificationSound";

/**
 * Подключает WebSocket к ChatService при наличии авторизации.
 * Подписывается на new_message и message_sent, обновляет chatStore.
 */
export function WebSocketInitializer() {
  const { user, isAuthenticated } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();
  const addIncomingWsMessage = useChatStore((s) => s.addIncomingWsMessage);
  const updateSentMessage = useChatStore((s) => s.updateSentMessage);
  const markOwnMessageReadByPeer = useChatStore((s) => s.markOwnMessageReadByPeer);
  const removeMessageFromActiveChat = useChatStore((s) => s.removeMessageFromActiveChat);
  const removeChatByRoomId = useChatStore((s) => s.removeChatByRoomId);
  const clearActiveChat = useChatStore((s) => s.clearActiveChat);
  const updatePeerPresence = useChatStore((s) => s.updatePeerPresence);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const connectedRef = useRef(false);
  const activeRoomIdRef = useRef(activeRoomId);
  const lastSoundedMessageIdRef = useRef<string | null>(null);
  const lastSoundedAtRef = useRef<number>(0);

  useEffect(() => {
    // На некоторых платформах WebAudio требует пользовательский жест.
    primeNotificationAudio();
    const onFirstGesture = () => {
      primeNotificationAudio();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, []);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

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
      if (message.type === "message_read" && data) {
        const payload = data as { message_id?: string };
        if (payload.message_id) {
          markOwnMessageReadByPeer(String(payload.message_id));
        }
      }
      if (message.type === "message_deleted" && data) {
        const payload = data as { message_id?: string };
        if (payload.message_id) {
          removeMessageFromActiveChat(String(payload.message_id));
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

        const messageId = String(payload.message_id ?? "");
        const senderId = String(payload.sender_id ?? "");
        const recipientId = payload.recipient_id != null ? String(payload.recipient_id) : null;
        const roomId = payload.room_id != null ? String(payload.room_id) : null;

        const shouldSound =
          // только если сообщение пришло мне
          (recipientId == null || recipientId === user.id) &&
          // и это не отправка от меня (на случай, если сервер шлёт обратно)
          senderId !== user.id &&
          // не дублируем один и тот же сигнал
          !!messageId &&
          lastSoundedMessageIdRef.current !== messageId &&
          // и не когда пользователь прямо сейчас в этом чате
          roomId != null
            ? activeRoomIdRef.current !== roomId
            : true;

        const nowTs = Date.now();
        if (shouldSound && nowTs - lastSoundedAtRef.current > 500) {
          lastSoundedAtRef.current = nowTs;
          lastSoundedMessageIdRef.current = messageId;
          playSoftMessageSound();
        }

        addIncomingWsMessage({
          message_id: messageId,
          sender_id: senderId,
          recipient_id: recipientId,
          room_id: roomId,
          currentUserId: user.id,
        });
      }

      if (message.type === "room_deleted" && data) {
        const payload = data as { room_id?: string };
        const roomId = payload.room_id ? String(payload.room_id) : "";
        if (roomId) {
          removeChatByRoomId(roomId);
          if (activeRoomIdRef.current === roomId) clearActiveChat();
        }
      }

      if (message.type === "user_online" && data) {
        const uid = String((data as { user_id?: string }).user_id ?? "");
        if (uid && uid !== user.id) updatePeerPresence(uid, true);
      }
      if (message.type === "user_offline" && data) {
        const payload = data as { user_id?: string; timestamp?: string };
        const uid = String(payload.user_id ?? "");
        if (uid && uid !== user.id) updatePeerPresence(uid, false, payload.timestamp);
      }
    });

    return () => {
      unsub();
    };
  }, [
    user?.id,
    addIncomingWsMessage,
    updateSentMessage,
    markOwnMessageReadByPeer,
    removeMessageFromActiveChat,
    removeChatByRoomId,
    clearActiveChat,
    updatePeerPresence,
  ]);

  return null;
}
