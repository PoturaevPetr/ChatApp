/** Закрытие полноэкранного чата на главной: сначала анимация, затем сброс query в слушателе. */
export const CHAT_OVERLAY_CLOSE_EVENT = "chatapp:chat-overlay-close";

export const CHAT_OVERLAY_SLIDE_MS = 320;

export function requestChatOverlayClose(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_OVERLAY_CLOSE_EVENT));
}

const SESSION_SKIP_CHAT_SLIDE_ONCE = "kindred_chat_skip_slide_once";

/** Вызвать перед переходом на главную с чатом (например с экрана профиля) — вход без слайда. */
export function markNextChatOverlayOpenWithoutSlide(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_SKIP_CHAT_SLIDE_ONCE, "1");
  } catch {
    // private mode / quota
  }
}

/** Одноразово: был ли запрошен вход в чат без анимации. */
export function consumeNextChatOverlayOpenWithoutSlide(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(SESSION_SKIP_CHAT_SLIDE_ONCE) !== "1") return false;
    window.sessionStorage.removeItem(SESSION_SKIP_CHAT_SLIDE_ONCE);
    return true;
  } catch {
    return false;
  }
}
