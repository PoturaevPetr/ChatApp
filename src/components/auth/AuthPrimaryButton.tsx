"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { authPrimaryButtonClassName } from "@/components/auth/authStyles";

type AuthPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function AuthPrimaryButton({
  loading = false,
  loadingLabel,
  children,
  disabled,
  className = "",
  ...props
}: AuthPrimaryButtonProps) {
  return (
    <button disabled={disabled || loading} className={`${authPrimaryButtonClassName} ${className}`} {...props}>
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
