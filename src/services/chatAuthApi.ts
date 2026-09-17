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
  /** PEM public key (клиентская генерация) */
  public_key: string;
}

export interface RegisterResponse {
  user_id: string;
  username: string;
  public_key: string;
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

export interface DeviceLinkExchangeRequest {
  code: string;
  service_id?: string;
  device_id: string;
  name?: string | null;
  platform: string;
  identity_key_public: string;
  signal_identity_key_public?: string;
  registration_id: number;
  signed_prekey_id?: number;
  signed_prekey_public?: string;
  signed_prekey_signature?: string;
  one_time_prekeys?: { key_id: number; public_key: string }[];
}

export interface DeviceLinkExchangeResponse extends LoginResponse {
  linked: boolean;
  device_id: string;
}

export type DeviceLinkRegisterBody = Omit<DeviceLinkExchangeRequest, "code" | "service_id">;

export interface DeviceLinkRequestResponse {
  request_id: string;
  code: string;
  expires_at: string;
  qr_payload: string;
}

export interface DeviceLinkPollResponse {
  status: "pending" | "approved" | "expired";
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  username?: string;
  encrypted_master_key?: string | null;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
}

export type OAuthProviderId = "google" | "yandex" | "vk";

export interface OAuthProvidersResponse {
  google: boolean;
  yandex: boolean;
  vk: boolean;
}

export interface OAuthAuthorizeUrlResponse {
  authorization_url: string;
}

export interface OAuthExchangeRequest {
  provider: OAuthProviderId;
  code: string;
  redirect_uri: string;
  service_id?: string;
  public_key?: string;
}

export interface OAuthExchangeResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  username: string;
  is_new_user: boolean;
  public_key?: string;
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

export interface UpdateMeRequest {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  /**
   * Формат `YYYY-MM-DD`.
   * Если поле не передано (undefined), сервер может оставить текущее значение.
   */
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

async function getJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : undefined;
  if (!res.ok) {
    throw new ChatAuthApiError(detail || res.statusText || `HTTP ${res.status}`, res.status, detail);
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
  async register(
    data: Omit<RegisterRequest, "service_id" | "avatar"> & { public_key?: string }
  ): Promise<RegisterResponse> {
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

  /** Вход по QR/коду с доверенного устройства (без JWT). */
  async deviceLinkExchange(
    body: Omit<DeviceLinkExchangeRequest, "service_id">,
  ): Promise<DeviceLinkExchangeResponse> {
    return request<DeviceLinkExchangeResponse>("/api/v1/auth/device-link/exchange", {
      method: "POST",
      body: { ...body, service_id: SERVICE_ID },
    });
  },

  /** Desktop: показать QR, ждать approve с телефона. */
  async deviceLinkRequest(body: DeviceLinkRegisterBody): Promise<DeviceLinkRequestResponse> {
    return request<DeviceLinkRequestResponse>("/api/v1/auth/device-link/request", {
      method: "POST",
      body: body as unknown as Record<string, unknown>,
    });
  },

  async deviceLinkPoll(requestId: string): Promise<DeviceLinkPollResponse> {
    return getJson<DeviceLinkPollResponse>(
      `/api/v1/auth/device-link/poll/${encodeURIComponent(requestId)}`,
    );
  },

  async refresh(refresh_token: string): Promise<RefreshTokenResponse> {
    return request<RefreshTokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      body: { refresh_token },
    });
  },

  /** Список включённых OAuth-провайдеров с бэкенда. GET /auth/oauth/providers */
  async oauthProviders(): Promise<OAuthProvidersResponse> {
    const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/auth/oauth/providers`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : undefined;
    if (!res.ok) {
      throw new ChatAuthApiError(detail || res.statusText || `HTTP ${res.status}`, res.status, detail);
    }
    return data as OAuthProvidersResponse;
  },

  /** Текущий пользователь. GET /auth/me */
  async getMe(accessToken: string): Promise<MeResponse> {
    return authRequest<MeResponse>("/api/v1/auth/me", accessToken);
  },

  async getOAuthAuthorizeUrl(provider: OAuthProviderId, redirectUri: string, state: string): Promise<OAuthAuthorizeUrlResponse> {
    const q = new URLSearchParams({
      provider,
      redirect_uri: redirectUri,
      state,
    });
    return getJson<OAuthAuthorizeUrlResponse>(`/api/v1/auth/oauth/authorize-url?${q.toString()}`);
  },

  async oauthExchange(body: OAuthExchangeRequest): Promise<OAuthExchangeResponse> {
    const payload: Record<string, unknown> = {
      provider: body.provider,
      code: body.code,
      redirect_uri: body.redirect_uri,
      service_id: body.service_id ?? SERVICE_ID,
    };
    if (body.public_key) payload.public_key = body.public_key;
    return request<OAuthExchangeResponse>("/api/v1/auth/oauth/exchange", {
      method: "POST",
      body: payload,
    });
  },

  async updateMe(accessToken: string, data: UpdateMeRequest): Promise<MeResponse> {
    const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/auth/update`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(data),
    });

    const json = await res.json().catch(() => ({}));
    const detail = typeof (json as { detail?: string }).detail === "string" ? (json as { detail: string }).detail : undefined;
    if (!res.ok) {
      throw new ChatAuthApiError(detail || res.statusText || `HTTP ${res.status}`, res.status, detail);
    }
    return json as MeResponse;
  },
};

export { ChatAuthApiError };
