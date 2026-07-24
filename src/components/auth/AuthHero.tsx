"use client";

import { MessageCircle } from "lucide-react";

type AuthHeroProps = {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
};

export function AuthHero({ title, subtitle, showLogo = true }: AuthHeroProps) {
  return (
    <div className="text-center">
      {showLogo ? (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-md ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
          <MessageCircle size={32} aria-hidden />
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
