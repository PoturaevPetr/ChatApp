"use client";

import { OAuthSocialButtons } from "@/components/OAuthSocialButtons";
import { AuthSection } from "@/components/auth/AuthSection";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { useOAuthProviders } from "@/hooks/useOAuthProviders";

type AuthOAuthSectionProps = {
  dividerLabel?: string;
};

export function AuthOAuthSection({ dividerLabel }: AuthOAuthSectionProps) {
  const { ready, hasProviders, providers } = useOAuthProviders();

  if (!ready || !hasProviders || !providers) return null;

  return (
    <>
      <AuthSection title="Быстрый вход">
        <AuthCard>
          <OAuthSocialButtons variant="rows" providers={providers} />
        </AuthCard>
      </AuthSection>
      {dividerLabel ? <AuthDivider label={dividerLabel} /> : null}
    </>
  );
}
