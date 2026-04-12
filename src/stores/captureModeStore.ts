"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type CaptureMode = "audio" | "video";

/** Старый ключ: в хранилище лежала строка audio|video без JSON. */
const LEGACY_LS_KEY = "kindred_chat_capture_mode";

const PERSIST_KEY = "kindred_capture_mode";

function isNative(): boolean {
  return typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** В WebView на iOS/Android localStorage ненадёжен — используем Preferences. */
const capacitorPreferencesStorage: StateStorage = {
  getItem: async (name) => {
    const { value } = await Preferences.get({ key: name });
    return value ?? null;
  },
  setItem: (name, value) => {
    void Preferences.set({ key: name, value });
  },
  removeItem: (name) => {
    void Preferences.remove({ key: name });
  },
};

function pickStorage(): StateStorage {
  if (typeof window === "undefined") return noopStorage;
  if (isNative()) return capacitorPreferencesStorage;
  return window.localStorage;
}

type CaptureModeState = {
  captureMode: CaptureMode;
  setCaptureMode: (mode: CaptureMode) => void;
  toggleCaptureMode: () => void;
};

export const useCaptureModeStore = create<CaptureModeState>()(
  persist(
    (set) => ({
      captureMode: "audio",
      setCaptureMode: (captureMode) => set({ captureMode }),
      toggleCaptureMode: () =>
        set((s) => ({ captureMode: s.captureMode === "audio" ? "video" : "audio" })),
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => pickStorage()),
      partialize: (s) => ({ captureMode: s.captureMode }),
      skipHydration: true,
      onRehydrateStorage: () => () => {
        if (typeof window === "undefined" || isNative()) return;
        try {
          if (localStorage.getItem(PERSIST_KEY) != null) return;
          const raw = localStorage.getItem(LEGACY_LS_KEY);
          if (raw === "audio" || raw === "video") {
            useCaptureModeStore.setState({ captureMode: raw });
          }
        } catch {
          //
        }
      },
    },
  ),
);
