"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { getAuthTokens } from "@/lib/secureStorage";

/**
 * Подключает WebSocket к ChatService при наличии авторизации.
 * Размещать внутри защищённых страниц (после AuthGuard).
 */
export function WebSocketInitializer() {
  const { user, isAuthenticated } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();
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
    getAuthTokens().then((tokens) => {
      if (cancelled || !tokens?.access_token) return;
      connect(user.id, tokens.access_token);
      connectedRef.current = true;
    });

    return () => {
      cancelled = true;
      disconnect();
      connectedRef.current = false;
    };
  }, [isAuthenticated, user?.id, connect, disconnect]);

  return null;
}
