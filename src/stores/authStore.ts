"use client";

import { create } from "zustand";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import {
  getAuth,
  setAuth,
  getChatKeys,
  setAuthWithTokens,
  setChatKeys,
  clearAuthData,
  getChatKeysForUser,
  setChatKeysForUser,
  type StoredUser,
  type StoredChatKeys,
} from "@/lib/secureStorage";
import {
  chatAuthApi,
  ChatAuthApiError,
  type LoginResponse,
  type MeResponse,
  type OAuthExchangeResponse,
} from "@/services/chatAuthApi";
import { useChatStore } from "@/stores/chatStore";
import { syncPushWithBackend } from "@/lib/pushNotifications";
import { ensureDeviceRegistered } from "@/services/chatDevicesApi";
import { getOrCreateLocalDeviceIdentity } from "@/lib/deviceIdentity";
import { useLlmAccessStore } from "@/stores/llmAccessStore";

/** Свести ответ /auth/me к StoredUser (ФИО, username, аватар data URL). */
function storedUserFromMe(me: MeResponse, base: StoredUser): StoredUser {
  const id = String(me.id ?? me.user_id ?? base.id);
  const parts = [me.last_name, me.first_name, me.middle_name].filter(Boolean) as string[];
  const nameFromMe = parts.length > 0 ? parts.join(" ").trim() : (me.username?.trim() ?? "");
  const name = nameFromMe || base.name;
  const raw = me.avatar;
  const hasAvatar = raw != null && String(raw).trim() !== "";
  const out: StoredUser = { id, name };
  if (hasAvatar) out.avatar = String(raw);
  return out;
}

async function fetchStoredUserProfile(accessToken: string, base: StoredUser): Promise<StoredUser> {
  try {
    const me = await chatAuthApi.getMe(accessToken);
    return storedUserFromMe(me, base);
  } catch {
    return base;
  }
}

/**
 * Private key только из локального хранилища (или после restore backup).
 * Сервер private не выдаёт.
 */
async function resolveChatKeys(userId: string): Promise<StoredChatKeys | null> {
  const local = await getChatKeysForUser(userId);
  if (local?.private_key) return local;
  return null;
}

async function applyDeviceLinkLoginResult(
  res: { access_token: string; refresh_token: string; user_id: string; username: string },
  set: (partial: Partial<AuthState> | ((s: AuthState) => Partial<AuthState>)) => void,
): Promise<void> {
  const identity = await getOrCreateLocalDeviceIdentity();
  const user: StoredUser = {
    id: String(res.user_id),
    name: res.username,
  };
  const enriched = await fetchStoredUserProfile(res.access_token, user);
  await setChatKeysForUser(String(res.user_id), {
    public_key: identity.publicKeyPem,
    private_key: identity.privateKeyPem,
  });
  await setAuthWithTokens(
    enriched,
    {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
    },
    {
      public_key: identity.publicKeyPem,
      private_key: identity.privateKeyPem,
    },
  );
  void useLlmAccessStore.getState().refresh();
  set({
    user: enriched,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    needsKeyRestore: false,
  });
  void syncPushWithBackend().catch(() => {});
}

export interface RegisterData {
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  birth_date: string; // YYYY-MM-DD
}

interface AuthState {
  user: StoredUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /** Нет локального private key (нужен backup passphrase или миграция). */
  needsKeyRestore: boolean;
  initialize: () => Promise<void>;
  login: (username: string, password?: string) => Promise<void>;
  /** Вход по QR/коду с доверенного устройства (мобильный сканирует kindred-link). */
  loginWithDeviceLink: (code: string) => Promise<void>;
  /** Завершение входа после approve с телефона (desktop poll). */
  completeDeviceLinkLogin: (res: LoginResponse) => Promise<void>;
  /** Завершение входа после OAuth (код уже обменян на бэкенде). */
  completeOAuthLogin: (payload: OAuthExchangeResponse, clientKeys?: StoredChatKeys | null) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearNeedsKeyRestore: () => void;
  /** Обновить данные текущего пользователя (avatar, name) и сохранить в storage — сразу отображается везде. */
  updateUser: (patch: Partial<Pick<StoredUser, "name" | "avatar">>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  needsKeyRestore: false,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const [user, tokens] = await Promise.all([getAuth(), getValidAuthTokens()]);
      if (user && tokens?.access_token) {
        let sessionKeys = await getChatKeys();
        if (!sessionKeys?.private_key && user?.id) {
          const userKeys = await getChatKeysForUser(user.id);
          if (userKeys?.private_key) {
            await setChatKeys(userKeys);
            sessionKeys = userKeys;
          }
        }
        if (!sessionKeys?.private_key && tokens?.access_token) {
          sessionKeys = await resolveChatKeys(user.id);
          if (sessionKeys) await setChatKeys(sessionKeys);
        }
        const enriched = await fetchStoredUserProfile(tokens.access_token, user);
        try {
          await setAuth(enriched);
        } catch {
          // quota / storage — всё равно показываем в сессии
        }
        set({
          user: enriched,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          needsKeyRestore: !sessionKeys?.private_key,
        });
        void ensureDeviceRegistered(tokens.access_token)
          .catch(() => {})
          .finally(() => {
            void useLlmAccessStore.getState().refresh();
          });
        void syncPushWithBackend().catch(() => {});
        return;
      }
      set({ user: null, isAuthenticated: false, isLoading: false, needsKeyRestore: false });
    } finally {
      set((s) => ({ ...s, isLoading: false }));
    }
  },


  loginWithDeviceLink: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const { buildDeviceRegisterBody } = await import("@/lib/buildDeviceRegisterBody");
      const deviceBody = await buildDeviceRegisterBody();
      const res = await chatAuthApi.deviceLinkExchange({ code, ...deviceBody });
      await applyDeviceLinkLoginResult(res, set);
    } catch (e) {
      const message =
        e instanceof ChatAuthApiError
          ? e.detail || e.message
          : e instanceof Error
            ? e.message
            : "Ошибка входа по QR";
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw e;
    }
  },

  completeDeviceLinkLogin: async (res: LoginResponse) => {
    set({ isLoading: true, error: null });
    try {
      await applyDeviceLinkLoginResult(res, set);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка входа";
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw e;
    }
  },

  login: async (username: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await chatAuthApi.login({ username, password });
      const user: StoredUser = {
        id: String(res.user_id),
        name: res.username,
      };
      const enriched = await fetchStoredUserProfile(res.access_token, user);
      try {
        await ensureDeviceRegistered(res.access_token);
      } catch {
        // device register best-effort
      }
      void useLlmAccessStore.getState().refresh();
      const keys = await resolveChatKeys(String(res.user_id));
      // After device ensure, keys often live in crypto secure storage → sync to session
      const { getChatKeys } = await import("@/lib/secureStorage");
      const sessionKeys = (await getChatKeys()) ?? keys;
      await setAuthWithTokens(
        enriched,
        {
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        },
        sessionKeys ?? undefined
      );
      set({
        user: enriched,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        needsKeyRestore: !sessionKeys?.private_key,
      });
      void syncPushWithBackend().catch(() => {});
    } catch (e) {
      const message =
        e instanceof ChatAuthApiError
          ? e.detail || e.message
          : e instanceof Error
            ? e.message
            : "Ошибка входа";
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      throw e;
    }
  },

  completeOAuthLogin: async (payload: OAuthExchangeResponse, clientKeys?: StoredChatKeys | null) => {
    set({ isLoading: true, error: null });
    try {
      const user: StoredUser = {
        id: String(payload.user_id),
        name: payload.username,
      };
      const enriched = await fetchStoredUserProfile(payload.access_token, user);
      if (clientKeys?.private_key && clientKeys.public_key) {
        await setChatKeysForUser(String(payload.user_id), clientKeys);
      } else {
        await resolveChatKeys(String(payload.user_id));
      }
      try {
        await ensureDeviceRegistered(payload.access_token);
      } catch {
        /* ignore */
      }
      const keysForSession =
        (await getChatKeysForUser(String(payload.user_id))) ?? (await getChatKeys());
      await setAuthWithTokens(
        enriched,
        {
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        },
        keysForSession ?? undefined
      );
      set({
        user: enriched,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        needsKeyRestore: !keysForSession?.private_key,
      });
      void syncPushWithBackend().catch(() => {});
      void useLlmAccessStore.getState().refresh();
    } catch (e) {
      const message =
        e instanceof ChatAuthApiError
          ? e.detail || e.message
          : e instanceof Error
            ? e.message
            : "Ошибка входа";
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      throw e;
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true, error: null });
    try {
      const identity = await getOrCreateLocalDeviceIdentity();
      const res = await chatAuthApi.register({
        ...data,
        public_key: identity.publicKeyPem,
      });
      await setChatKeysForUser(String(res.user_id), {
        public_key: identity.publicKeyPem,
        private_key: identity.privateKeyPem,
      });
      // Auto-login tokens from register → register device
      try {
        await ensureDeviceRegistered(res.access_token);
      } catch {
        /* ignore */
      }
      set({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        user: null,
        needsKeyRestore: false,
      });
    } catch (e) {
      const message =
        e instanceof ChatAuthApiError
          ? e.detail || e.message
          : e instanceof Error
            ? e.message
            : "Ошибка регистрации";
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      throw e;
    }
  },

  logout: async () => {
    await clearAuthData();
    useChatStore.getState().resetSession();
    useLlmAccessStore.getState().clear();
    set({ user: null, isAuthenticated: false, error: null, needsKeyRestore: false });
  },

  clearError: () => set({ error: null }),
  clearNeedsKeyRestore: () => set({ needsKeyRestore: false }),

  updateUser: async (patch) => {
    const current = get().user;
    if (!current) return;
    const updated: StoredUser = { ...current, ...patch };
    set({ user: updated });
    try {
      await setAuth(updated);
    } catch (e) {
      console.warn("[Auth] Failed to persist user update:", e);
    }
  },
}));
