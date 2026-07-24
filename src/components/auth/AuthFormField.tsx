"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { authInputClassName } from "@/components/auth/authStyles";

type AuthFormFieldProps = {
  id: string;
  label: string;
  children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthFormField({ id, label, children, className = "", ...inputProps }: AuthFormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children ?? <input id={id} className={`${authInputClassName} ${className}`} {...inputProps} />}
    </div>
  );
}
