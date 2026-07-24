"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

type AuthShellProps = {
  loading?: boolean;
  children: ReactNode;
};

export function AuthShell({ loading, children }: AuthShellProps) {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  return <div className="flex min-h-screen flex-col bg-background">{children}</div>;
}

type AuthShellBodyProps = {
  children: ReactNode;
  className?: string;
};

export function AuthShellBody({ children, className = "" }: AuthShellBodyProps) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 ${className}`}
    >
      <div className="w-full max-w-sm space-y-6">{children}</div>
    </div>
  );
}
