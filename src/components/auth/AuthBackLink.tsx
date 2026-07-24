"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type AuthBackLinkProps = {
  href?: string;
  onClick?: () => void;
  label?: string;
};

export function AuthBackLink({ href, onClick, label = "Назад" }: AuthBackLinkProps) {
  const className =
    "inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground";

  if (href) {
    return (
      <Link href={href} className={className}>
        <ArrowLeft size={18} aria-hidden />
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      <ArrowLeft size={18} aria-hidden />
      {label}
    </button>
  );
}

export function AuthTopBar({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">{children}</div>
  );
}
