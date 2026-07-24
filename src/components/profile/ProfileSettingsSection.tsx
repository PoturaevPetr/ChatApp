"use client";

import type { ReactNode } from "react";

type ProfileSettingsSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function ProfileSettingsSection({ title, children, className = "" }: ProfileSettingsSectionProps) {
  return (
    <section className={className}>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm backdrop-blur-sm divide-y divide-border/60">
        {children}
      </div>
    </section>
  );
}
