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

/** user_id из пути `/ws/{id}` — для сравнения без query (токен). */
function wsUrlUserId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/ws\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    const m = url.match(/\/ws\/([^/?#]+)/);
    return m ? m[1] : null;
  }
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
  private pendingRoomJoins = new Map<string, { resolve: () => void; reject: () => void; t: number }>();

  connect(userId: string, accessToken: string, callbacks?: ChatWebSocketCallbacks): void {
    const newUrl = getWebSocketUrl(userId, accessToken);
    if (this.ws?.readyState === WebSocket.OPEN && this.url === newUrl) return;

    const sameAccount =
      this.url != null && wsUrlUserId(this.url) === userId && wsUrlUserId(newUrl) === userId;
    // Не обрываем CONNECTING: иначе WebSocketInitializer и ensureConnected по очереди
    // рвут чужую попытку подключения → бесконечные переподключения.
    if (this.ws?.readyState === WebSocket.CONNECTING && sameAccount) return;
    // Уже открыт сокет этого пользователя (другой token в URL не трогаем — сервер уже принял сессию).
    if (this.ws?.readyState === WebSocket.OPEN && sameAccount) return;

    this.disconnect();
    this.callbacks = callbacks ?? {};
    this.url = newUrl;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[Chat WS] connected");
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as ChatWebSocketMessage;
        if (message.type === "room_joined") {
          const data = message.data as { room_id?: string } | undefined;
          const roomId = data?.room_id;
          if (roomId) {
            const pending = this.pendingRoomJoins.get(String(roomId));
            if (pending) {
              clearTimeout(pending.t);
              this.pendingRoomJoins.delete(String(roomId));
              pending.resolve();
            }
          }
        }
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

  isConnecting(): boolean {
    return this.ws?.readyState === WebSocket.CONNECTING;
  }

  /** Ждать подключения до timeoutMs. Возвращает true, если подключились, false по таймауту. */
  waitUntilConnected(timeoutMs: number): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(true);
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const t = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          clearInterval(t);
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(t);
          resolve(false);
        }
      }, 100);
    });
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

  /** Отправить join_room и дождаться room_joined. */
  joinRoom(roomId: string, timeoutMs = 2000): Promise<boolean> {
    if (!roomId) return Promise.resolve(false);
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(false);

    // If already waiting - keep the existing promise semantics by replacing.
    const prev = this.pendingRoomJoins.get(roomId);
    if (prev) {
      clearTimeout(prev.t);
      this.pendingRoomJoins.delete(roomId);
      prev.reject();
    }

    return new Promise((resolve) => {
      const t = window.setTimeout(() => {
        const pending = this.pendingRoomJoins.get(roomId);
        if (pending) this.pendingRoomJoins.delete(roomId);
        resolve(false);
      }, Math.max(200, timeoutMs));

      this.pendingRoomJoins.set(roomId, {
        resolve: () => resolve(true),
        reject: () => resolve(false),
        t,
      });

      this.send({ type: "join_room", data: { room_id: roomId } });
    });
  }
}

export const chatWebSocket = new ChatWebSocketClient();
