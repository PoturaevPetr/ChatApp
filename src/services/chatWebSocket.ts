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

/** Таймаут рукопожатия: при смене Wi‑Fi↔LTE сокет может «висеть» в CONNECTING без onclose. */
const WS_CONNECT_TIMEOUT_MS = 22_000;

class ChatWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<ChatWebSocketListener>();
  private url: string | null = null;
  private callbacks: ChatWebSocketCallbacks = {};
  private pendingRoomJoins = new Map<string, { resolve: () => void; reject: () => void; t: number }>();
  /** Монотонно растёт при каждой новой попытке — чтобы onclose/таймер старого сокета не трогали новый. */
  private socketGeneration = 0;
  /** В браузере setTimeout возвращает number; в Node — Timeout — храним как union. */
  private connectTimeoutId: ReturnType<typeof setTimeout> | number | null = null;

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId != null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  connect(userId: string, accessToken: string, callbacks?: ChatWebSocketCallbacks): void {
    const newUrl = getWebSocketUrl(userId, accessToken);
    if (this.ws?.readyState === WebSocket.OPEN && this.url === newUrl) return;

    const sameAccount =
      this.url != null && wsUrlUserId(this.url) === userId && wsUrlUserId(newUrl) === userId;
    // Уже открыт сокет этого пользователя (другой token в URL не трогаем — сервер уже принял сессию).
    if (this.ws?.readyState === WebSocket.OPEN && sameAccount) return;
    // CONNECTING не отсекаем: после смены сети сокет может «висеть», тогда нужен новый connect() ниже.

    const hadSocket = !!this.ws;
    this.disconnect();
    // disconnect() инвалидирует onclose старого сокета — вручную сбрасываем UI (isConnected), затем новые callbacks
    if (hadSocket) {
      this.callbacks.onClose?.();
    }
    this.callbacks = callbacks ?? {};
    this.url = newUrl;
    this.socketGeneration++;
    const myGeneration = this.socketGeneration;
    const socket = new WebSocket(newUrl);
    this.ws = socket;

    this.clearConnectTimeout();
    this.connectTimeoutId = window.setTimeout(() => {
      this.connectTimeoutId = null;
      if (myGeneration !== this.socketGeneration) return;
      if (socket.readyState === WebSocket.CONNECTING) {
        console.warn("[Chat WS] connect timeout, closing stuck socket");
        try {
          socket.close();
        } catch {
          //
        }
      }
    }, WS_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (myGeneration !== this.socketGeneration) return;
      this.clearConnectTimeout();
      console.log("[Chat WS] connected");
      this.callbacks.onOpen?.();
    };

    socket.onmessage = (event: MessageEvent) => {
      if (myGeneration !== this.socketGeneration) return;
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

    socket.onerror = (event) => {
      if (myGeneration !== this.socketGeneration) return;
      console.error("[Chat WS] error", event);
    };

    socket.onclose = () => {
      if (myGeneration !== this.socketGeneration) return;
      this.clearConnectTimeout();
      console.log("[Chat WS] closed");
      this.ws = null;
      this.url = null;
      this.callbacks.onClose?.();
    };
  }

  disconnect(): void {
    this.clearConnectTimeout();
    if (this.ws) {
      this.socketGeneration++;
      try {
        this.ws.close();
      } catch {
        //
      }
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
