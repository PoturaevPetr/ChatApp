/** Центрированная модалка (десктоп). */

export const CENTER_MODAL_ANIM_MS = 300;

export const centerModalRootClass =
  "fixed inset-0 flex items-center justify-center p-4";

export const centerModalBackdropBaseClass =
  "absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300";

export function centerModalBackdropOpacityClass(isVisible: boolean, isExiting: boolean): string {
  return isVisible && !isExiting ? "opacity-100" : "opacity-0";
}

export const centerModalPanelClass =
  "relative w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-card/85 shadow-2xl backdrop-blur-xl px-5 py-5 transition-all duration-300 ease-out";

export function centerModalPanelMotionClass(isVisible: boolean, isExiting: boolean): string {
  return isVisible && !isExiting ? "scale-100 opacity-100" : "scale-95 opacity-0";
}
