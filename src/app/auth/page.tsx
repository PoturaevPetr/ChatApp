"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, LogIn, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/15 text-primary items-center justify-center mb-4">
            <MessageCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ChatApp</h1>
          <p className="mt-2 text-muted-foreground">Выберите действие</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/login/"
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary text-primary-foreground py-3 px-4 font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <LogIn size={20} />
            Войти
          </Link>
          <Link
            href="/auth/register/"
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 px-4 font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <UserPlus size={20} />
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
