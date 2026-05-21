"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, MoreVertical, Send, Sparkles } from "lucide-react";
import { useAiAssistantStore } from "@/stores/aiAssistantStore";
import { useOllamaModelStore } from "@/stores/ollamaModelStore";
import { formatMessageTime } from "@/utils/chatUtils";
import { getMessageBubbleClassName } from "@/components/chat/chatMessageBubbleClassName";
import { AI_ASSISTANT_NAME } from "@/lib/aiAssistantConstants";
import { requestChatOverlayClose } from "@/lib/chatOverlayEvents";
import { AiAssistantMarkdown, stripMarkdownForPreview } from "@/components/ai/AiAssistantMarkdown";

export function AiAssistantThread({ mode = "embedded" }: { mode?: "embedded" | "standalone" }) {
  const router = useRouter();
  const messages = useAiAssistantStore((s) => s.messages);
  const isGenerating = useAiAssistantStore((s) => s.isGenerating);
  const sendUserText = useAiAssistantStore((s) => s.sendUserText);
  const sendAnalysisRequest = useAiAssistantStore((s) => s.sendAnalysisRequest);
  const consumePendingMessageAnalysis = useAiAssistantStore((s) => s.consumePendingMessageAnalysis);
  const [input, setInput] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingAnalysisStartedRef = useRef(false);

  const selectedModel = useOllamaModelStore((s) => s.selectedModel);
  const models = useOllamaModelStore((s) => s.models);
  const modelsLoading = useOllamaModelStore((s) => s.modelsLoading);
  const modelsError = useOllamaModelStore((s) => s.modelsError);
  const hydrateFromStorage = useOllamaModelStore((s) => s.hydrateFromStorage);
  const setSelectedModel = useOllamaModelStore((s) => s.setSelectedModel);
  const loadModels = useOllamaModelStore((s) => s.loadModels);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    void loadModels();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModelMenuOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-ai-model-menu-root]")) setModelMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [modelMenuOpen, loadModels]);

  useEffect(() => {
    if (pendingAnalysisStartedRef.current) return;
    const pending = consumePendingMessageAnalysis();
    if (!pending) return;
    pendingAnalysisStartedRef.current = true;
    void sendAnalysisRequest(pending.displayText, pending.llmPrompt);
  }, [consumePendingMessageAnalysis, sendAnalysisRequest]);

  useEffect(() => {
    return () => {
      pendingAnalysisStartedRef.current = false;
    };
  }, []);

  const onBack = () => {
    if (mode === "embedded") {
      requestChatOverlayClose();
    } else {
      router.push("/");
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isGenerating]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t || isGenerating) return;
    setInput("");
    await sendUserText(t);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="relative z-30 flex h-14 w-full shrink-0 items-center gap-2.5 border-b border-border bg-background/90 px-3 backdrop-blur-md md:shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Назад"
          title="Назад"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/15 text-primary shadow-sm">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-px">
          <div className="truncate text-sm font-semibold leading-none text-foreground">{AI_ASSISTANT_NAME}</div>
          <p className="truncate text-[11px] leading-tight text-muted-foreground" title={selectedModel}>
            {isGenerating ? "Печатает…" : selectedModel}
          </p>
        </div>

        <div className="relative shrink-0" data-ai-model-menu-root>
          <button
            type="button"
            onClick={() => setModelMenuOpen((v) => !v)}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Выбор модели"
            title="Выбор модели"
            aria-expanded={modelMenuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {modelMenuOpen ? (
            <div
              role="menu"
              aria-label="Модели Ollama"
              className="absolute right-0 top-full z-40 mt-1 max-h-[min(320px,50dvh)] min-w-[14rem] overflow-y-auto rounded-xl border border-white/15 bg-background/95 py-1 shadow-xl backdrop-blur-xl"
            >
              {modelsLoading && models.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Загрузка…
                </div>
              ) : null}
              {modelsError ? (
                <p className="px-3 py-2 text-xs text-destructive">{modelsError}</p>
              ) : null}
              {!modelsLoading && models.length === 0 && !modelsError ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Нет доступных моделей</p>
              ) : null}
              {models.map((name) => {
                const selected = name === selectedModel;
                return (
                  <button
                    key={name}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setSelectedModel(name);
                      setModelMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 focus:outline-none focus:bg-white/10 ${
                      selected ? "font-medium text-foreground" : "text-foreground/90"
                    }`}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {selected ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                );
              })}
              {selectedModel && !models.includes(selectedModel) && !modelsLoading ? (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked
                  onClick={() => setModelMenuOpen(false)}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-white/10 focus:outline-none focus:bg-white/10"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <Check className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <span className="min-w-0 truncate" title={selectedModel}>
                    {selectedModel}
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Задайте вопрос — ответ придёт с вашего сервера Ollama. История сохраняется, пока открыта вкладка.
            </div>
          ) : null}
          {messages.map((m) => {
            const own = m.role === "user";
            const bubble = getMessageBubbleClassName(own, "text");
            return (
              <div key={m.id} className={`flex w-full ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`${bubble} break-words text-sm ${own ? "whitespace-pre-wrap" : "min-w-0"}`}
                >
                  {own ? m.text : <AiAssistantMarkdown content={m.text} variant="assistant" />}
                </div>
              </div>
            );
          })}
          {isGenerating ? (
            <div className="flex justify-start">
              <div
                className={`${getMessageBubbleClassName(false, "text")} flex items-center gap-2 text-sm text-muted-foreground`}
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                <span>Ответ…</span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} className="h-px w-full shrink-0 scroll-mt-4" aria-hidden />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
        <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-2xl gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-3xl border border-border bg-background py-1 pl-3 pr-1 focus-within:ring-2 focus-within:ring-primary/30">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Сообщение…"
              disabled={isGenerating}
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isGenerating || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:enabled:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Отправить"
            >
              {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Для превью в списке чатов (последняя реплика). */
export function useAiAssistantListPreview(): {
  subtitle: string;
  timeLabel: string | null;
} {
  const messages = useAiAssistantStore((s) => s.messages);
  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  if (!last) {
    return { subtitle: "Задайте вопрос ассистенту", timeLabel: null };
  }
  const prefix = last.role === "user" ? "Вы: " : "";
  const raw = stripMarkdownForPreview(last.text).replace(/\s+/g, " ").trim();
  const short = raw.length > 52 ? `${raw.slice(0, 50)}…` : raw;
  return {
    subtitle: `${prefix}${short}`,
    timeLabel: formatMessageTime(last.createdAt),
  };
}
