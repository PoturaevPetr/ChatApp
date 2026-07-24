"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type ProfileSettingsRowProps = {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
};

export function ProfileSettingsRow({
  icon: Icon,
  label,
  subtitle,
  onClick,
  disabled = false,
  destructive = false,
  showChevron = true,
}: ProfileSettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors disabled:opacity-50 ${
        destructive
          ? "text-destructive hover:bg-destructive/5"
          : "text-foreground hover:bg-muted/40"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {showChevron ? (
        <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" aria-hidden />
      ) : null}
    </button>
  );
}
