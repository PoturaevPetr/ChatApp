"use client";

import { create } from "zustand";
import { fetchOllamaModels } from "@/lib/ollamaGenerate";
import {
  getActiveOllamaModel,
  getDefaultOllamaModel,
  writeStoredOllamaModel,
} from "@/lib/ollamaModelPreference";

interface OllamaModelState {
  selectedModel: string;
  models: string[];
  modelsLoading: boolean;
  modelsError: string | null;
  hydrated: boolean;
  hydrateFromStorage: () => void;
  setSelectedModel: (model: string) => void;
  loadModels: () => Promise<void>;
}

export const useOllamaModelStore = create<OllamaModelState>((set, get) => ({
  selectedModel: getDefaultOllamaModel(),
  models: [],
  modelsLoading: false,
  modelsError: null,
  hydrated: false,

  hydrateFromStorage: () => {
    if (get().hydrated) return;
    set({ selectedModel: getActiveOllamaModel(), hydrated: true });
  },

  setSelectedModel: (model) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    writeStoredOllamaModel(trimmed);
    set({ selectedModel: trimmed });
  },

  loadModels: async () => {
    if (get().modelsLoading) return;
    set({ modelsLoading: true, modelsError: null });
    try {
      const models = await fetchOllamaModels();
      set({ models, modelsLoading: false, modelsError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось загрузить список моделей";
      set({ modelsLoading: false, modelsError: msg });
    }
  },
}));
