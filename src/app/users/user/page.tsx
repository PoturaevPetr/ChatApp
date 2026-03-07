"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { getAuthTokens } from "@/lib/secureStorage";
import { getUserById } from "@/services/chatUsersApi";
import { createRoom } from "@/services/chatRoomsApi";
import type { UserSearchItem } from "@/services/chatUsersApi";

function getInitials(name: string): string {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function UserProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const userId = searchParams.get("user_id")?.trim() ?? null;
  const [profile, setProfile] = useState<UserSearchItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const tokens = await getAuthTokens();
      if (!tokens?.access_token) {
        if (!cancelled) setLoadError("Нет доступа");
        return;
      }
      try {
        const data = await getUserById(tokens.access_token, userId);
        if (!cancelled) {
          setProfile(data ?? null);
          if (data === null) setLoadError("Пользователь не найден");
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const displayName =
    profile?.name?.trim() ||
    (userId ? `Пользователь ${String(userId).slice(0, 8)}` : "Пользователь");

  const handleWriteMessage = async () => {
    if (!userId || !user) return;
    const tokens = await getAuthTokens();
    if (!tokens?.access_token) {
      setError("Нет доступа");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createRoom(tokens.access_token, userId);
      router.push(`/chat?userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(displayName)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать чат");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex flex-col h-full">
          <header className="shrink-0 flex items-center gap-3 p-4 border-b border-border bg-card">
            <Link
              href="/"
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Назад"
            >
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Профиль</h1>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {!userId ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">Не указан пользователь</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              </div>
            ) : loadError || !profile ? (
              <div className="py-8 text-center">
                <p className="text-destructive">{loadError ?? "Пользователь не найден"}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-24 h-24 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium text-3xl mb-4">
                    {getInitials(displayName)}
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {displayName}
                  </h2>
                  {profile.birth_date && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Дата рождения: {profile.birth_date}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 break-all">
                    ID: {userId}
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleWriteMessage}
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-primary-foreground font-medium hover:enabled:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {creating ? (
                    <>
                      <Loader2 size={22} className="animate-spin" />
                      Создание чата...
                    </>
                  ) : (
                    <>
                      <MessageCircle size={22} />
                      Написать сообщение
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}

export default function UserProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
        Загрузка...
      </div>
    }>
      <UserProfileContent />
    </Suspense>
  );
}
