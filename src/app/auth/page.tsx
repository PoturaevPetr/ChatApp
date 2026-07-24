"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { AuthShell, AuthShellBody } from "@/components/auth/AuthShell";
import { AuthHero } from "@/components/auth/AuthHero";
import { AuthSection } from "@/components/auth/AuthSection";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthNavRow } from "@/components/auth/AuthNavRow";
import { AuthOAuthSection } from "@/components/auth/AuthOAuthSection";

export default function AuthPage() {
  const router = useRouter();
  const { isAuthenticated, initialize } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initialize();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialize]);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/");
  }, [ready, isAuthenticated, router]);

  return (
    <AuthShell loading={!ready}>
      <AuthShellBody>
        <AuthHero title="Kindred" subtitle="Безопасный мессенджер для семьи и близких" />

        <AuthOAuthSection />

        <AuthSection title="Аккаунт">
          <AuthCard>
            <AuthNavRow href="/auth/login/" icon={LogIn} label="Войти" subtitle="Логин, пароль или QR" primary />
            <AuthNavRow href="/auth/register/" icon={UserPlus} label="Зарегистрироваться" subtitle="Создать новый аккаунт" />
          </AuthCard>
        </AuthSection>
      </AuthShellBody>
    </AuthShell>
  );
}
