import type { ChatMessage, ChatMessageContent } from "@/stores/chatStore";
import { getAttachmentTranscription } from "@/services/chatAttachmentsApi";
import { getMessagePreviewText } from "@/utils/chatUtils";

/** Сколько последних сообщений (включая целевое) уходит в контекст анализа одного сообщения. */
export const MESSAGE_ANALYSIS_CONTEXT_LIMIT = 50;

/** Максимум реплик в анализе переписки за период (от старых к новым в окне). */
export const CHAT_PERIOD_ANALYSIS_MESSAGE_LIMIT = 120;

export type ChatAnalysisPeriodHours = 1 | 2 | 6 | 24;

export const CHAT_ANALYSIS_PERIOD_OPTIONS: {
  hours: ChatAnalysisPeriodHours;
  label: string;
  displayLabel: string;
}[] = [
  { hours: 1, label: "За час", displayLabel: "за последний час" },
  { hours: 2, label: "За 2 часа", displayLabel: "за последние 2 часа" },
  { hours: 6, label: "За 6 часов", displayLabel: "за последние 6 часов" },
  { hours: 24, label: "За день", displayLabel: "за последние сутки" },
];

export type MessageAnalysisTargetKind = "text" | "voice";

export type MessageAnalysisRequest = {
  displayText: string;
  llmPrompt: string;
};

function isVoiceFileContent(content: ChatMessageContent): boolean {
  if (content.type !== "file" || !content.file) return false;
  const mime = content.file.mimeType ?? "";
  const name = (content.file.name ?? "").toLowerCase();
  if (mime.startsWith("audio/")) return true;
  if (/\.webm$/.test(name) && name.startsWith("audio-")) return true;
  return /\.(ogg|opus|mp3|wav|m4a|aac|flac|amr)$/.test(name);
}

export function getVoiceAttachmentId(message: ChatMessage): string | null {
  if (message.content.type !== "file" || !message.content.file) return null;
  if (!isVoiceFileContent(message.content)) return null;
  const id = message.content.file.file_ref?.attachment_id?.trim();
  return id || null;
}

export function isTextAnalyzableMessage(message: ChatMessage): boolean {
  return message.content.type === "text" && (message.content.text?.trim() ?? "").length > 0;
}

export function isVoiceAnalyzableCandidate(message: ChatMessage): boolean {
  return getVoiceAttachmentId(message) != null;
}

/** Синхронно: текст или голос с attachment (наличие расшифровки проверяется отдельно). */
export function isMessageAnalysisCandidate(message: ChatMessage): boolean {
  return isTextAnalyzableMessage(message) || isVoiceAnalyzableCandidate(message);
}

export async function fetchVoiceTranscriptionText(
  accessToken: string,
  attachmentId: string,
): Promise<string | null> {
  const r = await getAttachmentTranscription(accessToken, attachmentId);
  if (r.status !== "done") return null;
  const t = r.text?.trim() ?? "";
  return t.length > 0 ? t : null;
}

export async function resolveAnalysisTargetBody(
  accessToken: string,
  message: ChatMessage,
): Promise<{ kind: MessageAnalysisTargetKind; body: string } | null> {
  if (isTextAnalyzableMessage(message) && message.content.type === "text") {
    return { kind: "text", body: message.content.text.trim() };
  }
  const attachmentId = getVoiceAttachmentId(message);
  if (!attachmentId) return null;
  const text = await fetchVoiceTranscriptionText(accessToken, attachmentId);
  if (!text) return null;
  return { kind: "voice", body: text };
}

export function resolveMessageAuthorLabel(
  message: ChatMessage,
  currentUserId: string,
  peerDisplayName: string,
  memberShortNameByUserId?: Record<string, string>,
): string {
  const me = currentUserId.trim().toLowerCase();
  const sender = String(message.senderId ?? "").trim().toLowerCase();
  if (message.isOwn || (me && sender === me)) return "Вы";
  if (memberShortNameByUserId && sender) {
    const short = memberShortNameByUserId[sender];
    if (short?.trim()) return short.trim();
  }
  const peer = peerDisplayName.trim();
  return peer || "Собеседник";
}

function formatContextLine(author: string, body: string): string {
  return `${author}: ${body}`;
}

export function filterMessagesByPeriod(messages: ChatMessage[], periodHours: number): ChatMessage[] {
  const cutoff = Date.now() - periodHours * 60 * 60 * 1000;
  return messages.filter((m) => {
    const t = Date.parse(m.timestamp);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

export type MessageAnalysisContextParams = {
  messages: ChatMessage[];
  currentUserId: string;
  peerDisplayName: string;
  memberShortNameByUserId?: Record<string, string>;
  accessToken: string;
};

export async function buildContextLinesForMessages(
  params: MessageAnalysisContextParams,
): Promise<string[]> {
  const { messages, currentUserId, peerDisplayName, memberShortNameByUserId, accessToken } = params;
  const lines: string[] = [];
  for (const msg of messages) {
    const author = resolveMessageAuthorLabel(
      msg,
      currentUserId,
      peerDisplayName,
      memberShortNameByUserId,
    );
    const body = await resolveContextBody(accessToken, msg);
    lines.push(formatContextLine(author, body));
  }
  return lines;
}

async function resolveContextBody(
  accessToken: string,
  message: ChatMessage,
): Promise<string> {
  if (message.content.type === "text") {
    const t = message.content.text?.trim() ?? "";
    if (t) return t;
  }
  if (isVoiceAnalyzableCandidate(message)) {
    const attachmentId = getVoiceAttachmentId(message);
    if (attachmentId) {
      try {
        const tr = await fetchVoiceTranscriptionText(accessToken, attachmentId);
        if (tr) return `[Голосовое] ${tr}`;
      } catch {
        /* */
      }
    }
    return "[Голосовое сообщение — расшифровка недоступна]";
  }
  return getMessagePreviewText(message.content, 120);
}

export type BuildMessageAnalysisParams = {
  chatTitle: string;
  messages: ChatMessage[];
  targetMessageId: string;
  currentUserId: string;
  peerDisplayName: string;
  memberShortNameByUserId?: Record<string, string>;
  accessToken: string;
};

export async function buildMessageAnalysisRequest(
  params: BuildMessageAnalysisParams,
): Promise<MessageAnalysisRequest | null> {
  const {
    chatTitle,
    messages,
    targetMessageId,
    currentUserId,
    peerDisplayName,
    memberShortNameByUserId,
    accessToken,
  } = params;

  const targetIndex = messages.findIndex((m) => m.id === targetMessageId);
  if (targetIndex < 0) return null;

  const target = messages[targetIndex]!;
  const targetResolved = await resolveAnalysisTargetBody(accessToken, target);
  if (!targetResolved) return null;

  const sliceStart = Math.max(0, targetIndex - MESSAGE_ANALYSIS_CONTEXT_LIMIT + 1);
  const contextSlice = messages.slice(sliceStart, targetIndex + 1);

  const contextLines = await buildContextLinesForMessages({
    messages: contextSlice,
    currentUserId,
    peerDisplayName,
    memberShortNameByUserId,
    accessToken,
  });

  const targetAuthor = resolveMessageAuthorLabel(
    target,
    currentUserId,
    peerDisplayName,
    memberShortNameByUserId,
  );
  const targetTypeLabel =
    targetResolved.kind === "voice" ? "голосовое (расшифровка)" : "текстовое";

  const displayText =
    targetResolved.kind === "voice"
      ? `Анализ голосового сообщения от ${targetAuthor}`
      : `Анализ сообщения от ${targetAuthor}`;

  const llmPrompt = [
    "Ты — ассистент в мессенджере Kindred. Пользователь просит проанализировать одно сообщение из переписки.",
    "Отвечай по-русски, структурированно и по делу. Не выдумывай факты, которых нет в переписке ниже.",
    "",
    `Чат: ${chatTitle.trim() || "Переписка"}`,
    "",
    "Контекст переписки (хронологически, последние реплики):",
    ...contextLines,
    "",
    "Сообщение для анализа (выбрано пользователем):",
    `Автор: ${targetAuthor}`,
    `Тип: ${targetTypeLabel}`,
    "Содержание:",
    targetResolved.body,
    "",
    "Задача: с учётом контекста переписки проанализируй выделенное сообщение — смысл и намерение автора, тон, возможные подтексты, уместность в диалоге. Если уместно, предложи варианты ответа.",
  ].join("\n");

  return { displayText, llmPrompt };
}

export type BuildChatPeriodAnalysisParams = {
  chatTitle: string;
  messages: ChatMessage[];
  periodHours: ChatAnalysisPeriodHours;
  currentUserId: string;
  peerDisplayName: string;
  memberShortNameByUserId?: Record<string, string>;
  accessToken: string;
};

export async function buildChatPeriodAnalysisRequest(
  params: BuildChatPeriodAnalysisParams,
): Promise<MessageAnalysisRequest | null> {
  const {
    chatTitle,
    messages,
    periodHours,
    currentUserId,
    peerDisplayName,
    memberShortNameByUserId,
    accessToken,
  } = params;

  const periodMeta =
    CHAT_ANALYSIS_PERIOD_OPTIONS.find((o) => o.hours === periodHours) ??
    CHAT_ANALYSIS_PERIOD_OPTIONS[0]!;

  const inPeriod = filterMessagesByPeriod(messages, periodHours);
  if (inPeriod.length === 0) return null;

  const capped =
    inPeriod.length > CHAT_PERIOD_ANALYSIS_MESSAGE_LIMIT
      ? inPeriod.slice(inPeriod.length - CHAT_PERIOD_ANALYSIS_MESSAGE_LIMIT)
      : inPeriod;

  const contextLines = await buildContextLinesForMessages({
    messages: capped,
    currentUserId,
    peerDisplayName,
    memberShortNameByUserId,
    accessToken,
  });

  const displayText = `Анализ переписки ${periodMeta.displayLabel}`;

  const llmPrompt = [
    "Ты — ассистент в мессенджере Kindred. Пользователь просит проанализировать фрагмент переписки за выбранный период времени.",
    "Отвечай по-русски, структурированно и по делу. Не выдумывай факты, которых нет в переписке ниже.",
    "",
    `Чат: ${chatTitle.trim() || "Переписка"}`,
    `Период: ${periodMeta.label}`,
    "",
    "Переписка за период (хронологически):",
    ...contextLines,
    "",
    "Задача: проанализируй переписку за этот период — основные темы, динамику общения, тон и намерения сторон, ключевые моменты и возможные подтексты. Для голосовых учитывай только текст расшифровки. Если уместно — краткие рекомендации по дальнейшему общению.",
  ].join("\n");

  return { displayText, llmPrompt };
}
