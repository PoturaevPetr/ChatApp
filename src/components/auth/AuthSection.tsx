"use client";

import type { ReactNode } from "react";

type AuthSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function AuthSection({ title, children, className = "" }: AuthSectionProps) {
  return (
    <section className={className}>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
