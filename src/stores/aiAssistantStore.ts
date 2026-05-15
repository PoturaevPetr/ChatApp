"use client";

import { create } from "zustand";
import { ollamaGenerate } from "@/lib/ollamaGenerate";

export type AiAssistantMessageRole = "user" | "assistant";

export interface AiAssistantMessage {
  id: string;
  role: AiAssistantMessageRole;
  text: string;
  createdAt: string;
}

interface AiAssistantState {
  messages: AiAssistantMessage[];
  isGenerating: boolean;
  /** Ошибка последнего запроса (дублируется в пузырьке при необходимости). */
  lastError: string | null;
  sendUserText: (raw: string) => Promise<void>;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildPrompt(messages: AiAssistantMessage[]): string {
  const lines: string[] = [
    "Ты полезный ассистент в мессенджере Kindred. Отвечай по-русски, кратко и по делу, если пользователь не просит иначе.",
    "",
    "Диалог (последние реплики):",
  ];
  for (const m of messages) {
    const label = m.role === "user" ? "Пользователь" : "Ассистент";
    lines.push(`${label}: ${m.text}`);
    lines.push("");
  }
  lines.push("Ответь на последнее сообщение пользователя.");
  return lines.join("\n");
}

export const useAiAssistantStore = create<AiAssistantState>((set, get) => ({
  messages: [],
  isGenerating: false,
  lastError: null,

  sendUserText: async (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    const userMsg: AiAssistantMessage = {
      id: newId(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isGenerating: true,
      lastError: null,
    }));

    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const prompt = buildPrompt(get().messages);
      const response = await ollamaGenerate(prompt, controller.signal);
      const assistantMsg: AiAssistantMessage = {
        id: newId(),
        role: "assistant",
        text: response.trim() || "…",
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isGenerating: false,
        lastError: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
      const errBubble: AiAssistantMessage = {
        id: newId(),
        role: "assistant",
        text: `Не удалось получить ответ. ${msg}`,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, errBubble],
        isGenerating: false,
        lastError: msg,
      }));
    } finally {
      window.clearTimeout(timer);
    }
  },

}));
