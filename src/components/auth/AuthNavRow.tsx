"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type AuthNavRowProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  primary?: boolean;
};

export function AuthNavRow({ href, icon: Icon, label, subtitle, primary = false }: AuthNavRowProps) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-foreground transition-colors hover:bg-muted/40"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          primary ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
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
      <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" aria-hidden />
    </Link>
  );
}

type AuthActionRowProps = {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  onClick: () => void;
  disabled?: boolean;
};

export function AuthActionRow({ icon: Icon, label, subtitle, onClick, disabled }: AuthActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" aria-hidden />
    </button>
  );
}
