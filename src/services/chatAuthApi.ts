/**
 * API авторизации ChatService (https://chat.pirogov.ai)
 * Соответствует server/api/auth.py
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

const SERVICE_ID = "chatApp";

export interface RegisterRequest {
  username: string;
  service_id: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  birth_date: string; // YYYY-MM-DD
  avatar?: string;
}

export interface RegisterResponse {
  user_id: string;
  username: string;
  public_key: string;
  private_key: string;
  access_token: string;
  refresh_token: string;
}

export interface LoginRequest {
  username: string;
  service_id: string;
  password?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  username: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
}

/** Ответ GET /auth/me — текущий пользователь */
export interface MeResponse {
  id?: string;
  user_id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
}

class ChatAuthApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = "ChatAuthApiError";
  }
}

async function request<T>(path: string, options: { method: string; body?: Record<string, unknown> }): Promise<T> {
  const { body, method } = options;
  const url = `${BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : undefined;

  if (!res.ok) {
    throw new ChatAuthApiError(
      detail || res.statusText || `HTTP ${res.status}`,
      res.status,
      detail
    );
  }

  return data as T;
}

async function authRequest<T>(path: string, accessToken: string): Promise<T> {
  const url = `${BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : undefined;
  if (!res.ok) {
    throw new ChatAuthApiError(detail || res.statusText || `HTTP ${res.status}`, res.status, detail);
  }
  return data as T;
}

export const chatAuthApi = {
  async register(data: Omit<RegisterRequest, "service_id" | "avatar">): Promise<RegisterResponse> {
    const body: RegisterRequest = {
      ...data,
      service_id: SERVICE_ID,
    };
    return request<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: body as unknown as Record<string, unknown>,
    });
  },

  async login(data: Omit<LoginRequest, "service_id">): Promise<LoginResponse> {
    return request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { ...data, service_id: SERVICE_ID },
    });
  },

  async refresh(refresh_token: string): Promise<RefreshTokenResponse> {
    return request<RefreshTokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      body: { refresh_token },
    });
  },

  /** Текущий пользователь. GET /auth/me */
  async getMe(accessToken: string): Promise<MeResponse> {
    return authRequest<MeResponse>("/api/v1/auth/me", accessToken);
  },
};

export { ChatAuthApiError };
