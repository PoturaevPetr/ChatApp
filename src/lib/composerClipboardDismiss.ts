/**
 * После отправки сообщения не показывать подсказку из буфера для того же содержимого,
 * пока пользователь не скопирует что-то другое (сохраняется между открытиями чата в рамках сессии SPA).
 */
let dismissedClipboardSig: string | null = null;

export function composerClipboardSignature(
  s: { kind: "text"; text: string } | { kind: "image"; file: File },
): string {
  if (s.kind === "text") {
    return `t:${s.text.slice(0, 4096)}`;
  }
  return `i:${s.file.size}:${s.file.type}`;
}

export function markComposerClipboardContentDismissed(
  s: { kind: "text"; text: string } | { kind: "image"; file: File },
): void {
  dismissedClipboardSig = composerClipboardSignature(s);
}

export function isComposerClipboardContentDismissed(
  s: { kind: "text"; text: string } | { kind: "image"; file: File } | null,
): boolean {
  if (!s || !dismissedClipboardSig) return false;
  return composerClipboardSignature(s) === dismissedClipboardSig;
}
