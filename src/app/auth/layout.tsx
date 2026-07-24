import type { ReactNode } from "react";
import { OAuthProvidersProvider } from "@/components/auth/OAuthProvidersProvider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <OAuthProvidersProvider>{children}</OAuthProvidersProvider>;
}
