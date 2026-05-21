"use client";

import { create } from "zustand";
import { ollamaGenerate } from "@/lib/ollamaGenerate";

export type AiAssistantMessageRole = "user" | "assistant";

export interface AiAssistantMessage {
  id: string;
  role: AiAssistantMessageRole;
  /** Текст в пузырьке в UI. */
  text: string;
  createdAt: string;
  /** Полный промпт для LLM (например анализ сообщения из чата); в UI не показывается. */
  promptText?: string;
}

export type PendingMessageAnalysis = {
  displayText: string;
  llmPrompt: string;
};

interface AiAssistantState {
  messages: AiAssistantMessage[];
  isGenerating: boolean;
  /** Ошибка последнего запроса (дублируется в пузырьке при необходимости). */
  lastError: string | null;
  /** Запрос анализа из чата: забирается при открытии AI-помощника. */
  pendingMessageAnalysis: PendingMessageAnalysis | null;
  queueMessageAnalysis: (request: PendingMessageAnalysis) => void;
  consumePendingMessageAnalysis: () => PendingMessageAnalysis | null;
  sendUserText: (raw: string) => Promise<void>;
  sendAnalysisRequest: (displayText: string, llmPrompt: string) => Promise<void>;
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
    const body = m.role === "user" && m.promptText ? m.promptText : m.text;
    lines.push(`${label}: ${body}`);
    lines.push("");
  }
  lines.push("Ответь на последнее сообщение пользователя.");
  return lines.join("\n");
}

async function runAssistantGeneration(
  get: () => AiAssistantState,
  set: (partial: Partial<AiAssistantState> | ((s: AiAssistantState) => Partial<AiAssistantState>)) => void,
): Promise<void> {
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
    set({
      messages: [...get().messages, assistantMsg],
      isGenerating: false,
      lastError: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    const errBubble: AiAssistantMessage = {
      id: newId(),
      role: "assistant",
      text: `Не удалось получить ответ. ${msg}`,
      createdAt: new Date().toISOString(),
    };
    set({
      messages: [...get().messages, errBubble],
      isGenerating: false,
      lastError: msg,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export const useAiAssistantStore = create<AiAssistantState>((set, get) => ({
  messages: [],
  isGenerating: false,
  lastError: null,
  pendingMessageAnalysis: null,

  queueMessageAnalysis: (request) => {
    set({ pendingMessageAnalysis: request });
  },

  consumePendingMessageAnalysis: () => {
    const pending = get().pendingMessageAnalysis;
    if (pending) set({ pendingMessageAnalysis: null });
    return pending;
  },

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

    await runAssistantGeneration(get, set);
  },

  sendAnalysisRequest: async (displayText, llmPrompt) => {
    const text = displayText.trim();
    const prompt = llmPrompt.trim();
    if (!text || !prompt) return;

    const userMsg: AiAssistantMessage = {
      id: newId(),
      role: "user",
      text,
      promptText: prompt,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isGenerating: true,
      lastError: null,
    }));

    await runAssistantGeneration(get, set);
  },
}));
