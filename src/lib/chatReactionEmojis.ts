/**
 * Разрешённые реакции (должны совпадать с `REACTION_EMOJI_ALLOWLIST` на сервере, reaction_service.py).
 * 20 эмодзи + ❤️.
 */
export const CHAT_REACTION_EMOJIS: readonly string[] = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "👍",
  "👎",
  "🔥",
  "✨",
  "😍",
  "🤔",
  "😭",
  "💯",
  "🎉",
  "😊",
  "😡",
  "🤣",
  "👀",
  "💪",
  "🙌",
] as const;
