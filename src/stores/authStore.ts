"use client";

import { create } from "zustand";
import {
  getAuth,
  getAuthTokens,
  setAuthWithTokens,
  clearAuthData,
  getChatKeysForUser,
  setChatKeysForUser,
  type StoredUser,
} from "@/lib/secureStorage";
import { chatAuthApi, ChatAuthApiError } from "@/services/chatAuthApi";

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
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const [user, tokens] = await Promise.all([getAuth(), getAuthTokens()]);
      if (user && tokens?.access_token) {
        if (tokens.refresh_token) {
          try {
            const refreshed = await chatAuthApi.refresh(tokens.refresh_token);
            await setAuthWithTokens(user, {
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
            });
          } catch {
            // Refresh failed — keep existing tokens, don't clear session
          }
        }
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
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
      const keys = await getChatKeysForUser(String(res.user_id));
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
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
