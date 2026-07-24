"use client";

import type { ReactNode } from "react";
import { authCardClassName } from "@/components/auth/authStyles";

type AuthCardProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function AuthCard({ children, className = "", padded = false }: AuthCardProps) {
  return (
    <div className={`${authCardClassName} ${padded ? "p-4 sm:p-5" : ""} ${className}`}>{children}</div>
  );
}
