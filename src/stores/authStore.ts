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
} from "@/lib/secureStorage";
import { chatAuthApi, ChatAuthApiError } from "@/services/chatAuthApi";
import { getMyKeypair } from "@/services/chatKeysApi";
import { useChatStore } from "@/stores/chatStore";
import { syncPushWithBackend } from "@/lib/pushNotifications";

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
  initialize: () => Promise<void>;
  login: (username: string, password?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** Обновить данные текущего пользователя (avatar, name) и сохранить в storage — сразу отображается везде. */
  updateUser: (patch: Partial<Pick<StoredUser, "name" | "avatar">>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const [user, tokens] = await Promise.all([getAuth(), getValidAuthTokens()]);
      if (user && tokens?.access_token) {
        // Восстановить ключи чата: из локального хранилища по user_id или с сервера (вход с любого устройства)
        let sessionKeys = await getChatKeys();
        if (!sessionKeys?.private_key && user?.id) {
          const userKeys = await getChatKeysForUser(user.id);
          if (userKeys?.private_key) {
            await setChatKeys(userKeys);
            sessionKeys = userKeys;
          }
        }
        if (!sessionKeys?.private_key && tokens?.access_token) {
          try {
            const keypair = await getMyKeypair(tokens.access_token);
            const keys = {
              public_key: keypair.public_key,
              private_key: keypair.private_key,
            };
            await setChatKeys(keys);
            await setChatKeysForUser(user.id, keys);
          } catch {
            // Нет ключей на сервере (пользователь без ключевой пары) — не блокируем вход
          }
        }
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        void syncPushWithBackend().catch(() => {});
        return;
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    } finally {
      set((s) => ({ ...s, isLoading: false }));
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
      let keys = await getChatKeysForUser(String(res.user_id));
      if (!keys?.private_key) {
        try {
          const keypair = await getMyKeypair(res.access_token);
          keys = {
            public_key: keypair.public_key,
            private_key: keypair.private_key,
          };
          await setChatKeysForUser(String(res.user_id), keys);
        } catch {
          // Ключей на сервере нет (старый пользователь без ключей) — вход без чата
        }
      }
      await setAuthWithTokens(
        user,
        {
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        },
        keys ?? undefined
      );
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
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

  register: async (data: RegisterData) => {
    set({ isLoading: true, error: null });
    try {
      const res = await chatAuthApi.register(data);
      if (res.public_key && res.private_key) {
        await setChatKeysForUser(String(res.user_id), {
          public_key: res.public_key,
          private_key: res.private_key,
        });
      }
      set({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        user: null,
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
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),

  updateUser: async (patch) => {
    const current = get().user;
    if (!current) return;
    const updated: StoredUser = { ...current, ...patch };
    // Сначала обновляем Zustand, чтобы UI обновился сразу.
    set({ user: updated });
    // Затем пытаемся сохранить в storage. Если quota/ошибка — не ломаем UI.
    try {
      await setAuth(updated);
    } catch (e) {
      console.warn("[Auth] Failed to persist user update:", e);
    }
  },
}));
