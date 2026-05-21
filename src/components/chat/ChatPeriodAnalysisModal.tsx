"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import {
  CHAT_ANALYSIS_PERIOD_OPTIONS,
  type ChatAnalysisPeriodHours,
} from "@/lib/messageAnalysis";

export type ChatPeriodAnalysisModalProps = {
  open: boolean;
  chatTitle: string;
  onClose: () => void;
  onSelectPeriod: (hours: ChatAnalysisPeriodHours) => void;
  isRunning?: boolean;
};

export function ChatPeriodAnalysisModal({
  open,
  chatTitle,
  onClose,
  onSelectPeriod,
  isRunning = false,
}: ChatPeriodAnalysisModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (!isRunning) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Анализ переписки за период"
        className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-background/70 p-4 shadow-xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isRunning}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <p className="text-sm font-semibold text-foreground">Анализ переписки</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{chatTitle}</p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          AI-помощник проанализирует сообщения за выбранный период с учётом контекста чата. Учитываются
          текстовые сообщения и голосовые с расшифровкой.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {CHAT_ANALYSIS_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.hours}
              type="button"
              disabled={isRunning}
              onClick={() => onSelectPeriod(opt.hours)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              <span>{opt.label}</span>
              {isRunning ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={onClose}
          className="mt-4 w-full rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

