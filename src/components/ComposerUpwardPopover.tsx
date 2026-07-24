"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface ComposerUpwardPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/** Выпадающая панель над якорной кнопкой в composer (десктоп). */
export function ComposerUpwardPopover({
  open,
  onClose,
  anchorRef,
  children,
  className = "",
  ariaLabel,
}: ComposerUpwardPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useClickOutside([anchorRef, popoverRef], onClose, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      className={`absolute bottom-full left-0 z-50 mb-2 min-w-[12rem] origin-bottom opacity-100 transition-opacity duration-200 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
