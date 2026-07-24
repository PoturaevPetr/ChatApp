"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { chatAuthApi, type OAuthProvidersResponse } from "@/services/chatAuthApi";

export function hasAnyOAuthProvider(providers: OAuthProvidersResponse): boolean {
  return Boolean(providers.google || providers.yandex || providers.vk);
}

type OAuthProvidersContextValue = {
  ready: boolean;
  hasProviders: boolean;
  providers: OAuthProvidersResponse | null;
  refetch: () => Promise<void>;
};

const OAuthProvidersContext = createContext<OAuthProvidersContextValue | null>(null);

async function fetchOAuthProviders(): Promise<OAuthProvidersResponse | null> {
  try {
    return await chatAuthApi.oauthProviders();
  } catch {
    return null;
  }
}

export function OAuthProvidersProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<OAuthProvidersResponse | null>(null);

  const refetch = useCallback(async () => {
    const response = await fetchOAuthProviders();
    setProviders(response);
    setReady(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  const value = useMemo(
    (): OAuthProvidersContextValue => ({
      ready,
      providers,
      hasProviders: providers ? hasAnyOAuthProvider(providers) : false,
      refetch,
    }),
    [ready, providers, refetch],
  );

  return <OAuthProvidersContext.Provider value={value}>{children}</OAuthProvidersContext.Provider>;
}

export function useOAuthProviders(): OAuthProvidersContextValue {
  const context = useContext(OAuthProvidersContext);
  if (context) return context;

  throw new Error("useOAuthProviders must be used within OAuthProvidersProvider");
}
