export type MessageBubbleClassOptions = {
  /** Точные размеры как в чате: пузырёк на всю обёртку (без max-w-% от узкого родителя). */
  fillAnchor?: boolean;
  /**
   * Ряд «аватар + пузырёк» в группе: снаружи уже `max-w-[85%]` как у входящих в direct.
   * Пузырёк заполняет колонку справа от аватара, без повторного 85% от узкого родителя.
   */
  enclosedMaxWidth?: boolean;
};

export type MessageBubbleLayout = "text" | "audio" | "video";

/** Оболочка пузырька: компактные отступы, свои (primary) / чужие (muted). Видео — без заливки, только контент и обводка у круга. */
export function getMessageBubbleClassName(
  isOwn: boolean,
  layout: MessageBubbleLayout,
  opts?: MessageBubbleClassOptions,
): string {
  if (layout === "video") {
    const width = opts?.fillAnchor
      ? "h-full w-full max-w-none min-h-0"
      : opts?.enclosedMaxWidth
        ? "w-full min-w-0 max-w-[min(92%,300px)]"
        : "max-w-[min(92%,300px)]";
    return `${width} min-w-0 overflow-visible rounded-2xl bg-transparent px-1 py-1 text-foreground shadow-none ring-0 ring-transparent dark:bg-transparent dark:shadow-none group select-none transition-shadow duration-200 sm:px-1.5 sm:py-1.5`;
  }

  const width = opts?.fillAnchor
    ? "h-full w-full max-w-none min-h-0"
    : opts?.enclosedMaxWidth
      ? "w-full min-w-0 max-w-full"
      : layout === "audio"
        ? "w-full max-w-[92%]"
        : "max-w-[85%]";
  const overflowCls = layout === "audio" ? "overflow-visible" : "overflow-hidden";
  const base = `${width} min-w-0 ${overflowCls} rounded-2xl px-3 py-1.5 group select-none transition-shadow duration-200 shadow-sm sm:px-3.5 sm:py-2`;
  if (isOwn) {
    return `${base} rounded-br-md bg-primary text-primary-foreground shadow-black/10 ring-1 ring-inset ring-white/20 dark:shadow-black/35`;
  }
  return `${base} rounded-bl-md bg-muted text-foreground shadow-black/[0.05] ring-1 ring-inset ring-black/[0.04] dark:shadow-black/30 dark:ring-white/10`;
}
