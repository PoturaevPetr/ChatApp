/**
 * Общая оболочка нижних модалок (аватар, выход, данные профиля).
 * Нижний отступ под кнопками внутри панели — bottomSheetPanelBottomStyle (inline на панели).
 */
export const BOTTOM_SHEET_ANIM_MS = 300;

/** Воздух под последним рядом кнопок внутри панели (над home indicator) */
export const bottomSheetPanelBottomStyle = {
  paddingBottom: "max(2.5rem, calc(1.75rem + env(safe-area-inset-bottom, 0px)))",
} as const;

/** Корень: лист на всю ширину экрана, прижат к низу экрана */
export const bottomSheetRootClass =
  "fixed inset-0 flex w-full min-w-0 flex-col justify-end pt-10";

export const bottomSheetBackdropBaseClass =
  "absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300";

export function bottomSheetBackdropOpacityClass(isVisible: boolean, isExiting: boolean): string {
  return isVisible && !isExiting ? "opacity-100" : "opacity-0";
}

const bottomSheetPanelVisual =
  "relative w-full min-w-0 max-w-none overflow-hidden rounded-t-[1.35rem] border-t border-border/80 bg-card shadow-[0_-10px_44px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.48)]";

const bottomSheetPanelPadding = "px-5 pt-2";

/** Компактные листы (аватар, выход) */
export const bottomSheetPanelClass = `${bottomSheetPanelVisual} min-h-[18vh] ${bottomSheetPanelPadding}`;

/** Лист с формой (профиль): ограничение по высоте и колонка */
export const bottomSheetPanelTallClass = `${bottomSheetPanelVisual} flex min-h-[18vh] max-h-[min(90dvh,640px)] flex-col ${bottomSheetPanelPadding}`;

/** Индикатор «свайп» сверху панели */
export const bottomSheetHandleClass =
  "mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/20";
