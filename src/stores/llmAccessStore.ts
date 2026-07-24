"use client";

import { create } from "zustand";
import { getOrCreateLocalDeviceIdentity } from "@/lib/deviceIdentity";
import { decryptLlmApiKeyBundle } from "@/lib/llmApiKeyCrypto";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { fetchLlmAccess } from "@/services/llmAccessApi";

interface LlmAccessState {
  enabled: boolean;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  baseUrl: string | null;
  apiKeyHeader: string | null;
  /** Только в памяти сессии — не персистится. */
  apiKey: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

let refreshInFlight: Promise<void> | null = null;

export const useLlmAccessStore = create<LlmAccessState>((set, get) => ({
  enabled: false,
  hydrated: false,
  loading: false,
  error: null,
  baseUrl: null,
  apiKeyHeader: null,
  apiKey: null,

  clear: () => {
    set({
      enabled: false,
      hydrated: false,
      loading: false,
      error: null,
      baseUrl: null,
      apiKeyHeader: null,
      apiKey: null,
    });
  },

  refresh: async () => {
    if (refreshInFlight) {
      await refreshInFlight;
      return;
    }

    refreshInFlight = (async () => {
      set({ loading: true, error: null });
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token) {
          get().clear();
          set({ hydrated: true, loading: false });
          return;
        }

        const identity = await getOrCreateLocalDeviceIdentity();
        const response = await fetchLlmAccess(tokens.access_token, identity.deviceId);

        if (!response.enabled || !response.encrypted_api_key) {
          set({
            enabled: false,
            hydrated: true,
            loading: false,
            error: null,
            baseUrl: null,
            apiKeyHeader: null,
            apiKey: null,
          });
          return;
        }

        const decrypted = await decryptLlmApiKeyBundle(
          response.encrypted_api_key,
          identity.privateKeyPem,
        );
        if (!decrypted?.apiKey) {
          set({
            enabled: false,
            hydrated: true,
            loading: false,
            error: "Не удалось расшифровать ключ LLM",
            baseUrl: null,
            apiKeyHeader: null,
            apiKey: null,
          });
          return;
        }

        set({
          enabled: true,
          hydrated: true,
          loading: false,
          error: null,
          baseUrl: response.base_url?.trim() || null,
          apiKeyHeader: response.api_key_header?.trim() || decrypted.apiKeyHeader,
          apiKey: decrypted.apiKey,
        });
      } catch (e) {
        set({
          enabled: false,
          hydrated: true,
          loading: false,
          error: e instanceof Error ? e.message : "Ошибка загрузки LLM доступа",
          baseUrl: null,
          apiKeyHeader: null,
          apiKey: null,
        });
      } finally {
        refreshInFlight = null;
      }
    })();

    await refreshInFlight;
  },
}));

/** Синхронный снимок credentials для ollamaGenerate (после refresh). */
export function getLlmCredentialsSnapshot(): {
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyHeader: string | null;
  enabled: boolean;
} {
  const s = useLlmAccessStore.getState();
  return {
    enabled: s.enabled,
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    apiKeyHeader: s.apiKeyHeader,
  };
}
