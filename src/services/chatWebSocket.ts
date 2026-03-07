/**
 * WebSocket клиент для ChatService (https://chat.pirogov.ai)
 * Подключение: wss://.../ws/{user_id}?token={access_token}
 */

function getWsBaseUrl(): string {
  const base =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
      : "https://chat.pirogov.ai";
  return base.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://").replace(/\/$/, "");
}

export function getWebSocketUrl(userId: string, accessToken: string): string {
  const wsBase = getWsBaseUrl();
  const params = new URLSearchParams({ token: accessToken });
  return `${wsBase}/ws/${userId}?${params.toString()}`;
}

export interface ChatWebSocketMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
}

export type ChatWebSocketListener = (message: ChatWebSocketMessage) => void;

export interface ChatWebSocketCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
}

class ChatWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<ChatWebSocketListener>();
  private url: string | null = null;
  private callbacks: ChatWebSocketCallbacks = {};

  connect(userId: string, accessToken: string, callbacks?: ChatWebSocketCallbacks): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (this.url === getWebSocketUrl(userId, accessToken)) return;
      this.disconnect();
    }
    this.callbacks = callbacks ?? {};
    this.url = getWebSocketUrl(userId, accessToken);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[Chat WS] connected");
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as ChatWebSocketMessage;
        this.listeners.forEach((cb) => cb(message));
      } catch (e) {
        console.warn("[Chat WS] parse error", e);
      }
    };

    this.ws.onerror = (event) => {
      console.error("[Chat WS] error", event);
    };

    this.ws.onclose = () => {
      console.log("[Chat WS] closed");
      this.ws = null;
      this.url = null;
      this.callbacks.onClose?.();
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.url = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onMessage(cb: ChatWebSocketListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const chatWebSocket = new ChatWebSocketClient();
