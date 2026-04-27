"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Loader2, Phone, Video } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { markNextChatOverlayOpenWithoutSlide } from "@/lib/chatOverlayEvents";
import { getUserById } from "@/services/chatUsersApi";
import type { UserSearchItem } from "@/services/chatUsersApi";
import { formatPeerPresenceLabel } from "@/lib/formatPeerPresence";
import { PeerChatMediaGallery } from "@/components/PeerChatMediaGallery";

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

function formatBirthDateWithAge(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const hasBirthdayPassedThisYear =
    now.getMonth() > d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
  if (!hasBirthdayPassedThisYear) age -= 1;
  const dateText = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  if (!Number.isFinite(age) || age <= 0) return dateText;
  return `${dateText} (${age})`;
}

function inferOnlineFromLastSeen(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const d = new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= 45_000;
}

function UserProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const userId = searchParams.get("user_id")?.trim() ?? null;
  const [profile, setProfile] = useState<UserSearchItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presenceClock, bumpPresenceClock] = useState(0);

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
      const tokens = await getValidAuthTokens();
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
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => bumpPresenceClock((t) => t + 1), 45000);
    return () => window.clearInterval(id);
  }, [userId]);

  const displayName =
    profile?.name?.trim() ||
    (userId ? `Пользователь ${String(userId).slice(0, 8)}` : "Пользователь");
  void presenceClock;
  const isOnlineNow = inferOnlineFromLastSeen(profile?.lastSeenAt ?? null);
  const presenceLabel = formatPeerPresenceLabel({
    isOnline: isOnlineNow,
    lastSeenAt: profile?.lastSeenAt ?? null,
  });

  const handleWriteMessage = () => {
    if (!userId) return;
    markNextChatOverlayOpenWithoutSlide();
    router.push(`/?userId=${encodeURIComponent(userId)}`);
  };

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex flex-col h-full">
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
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center font-medium text-3xl mb-4">
                    {profile.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {displayName}
                  </h2>
                  <p className={`text-sm mt-0.5 ${isOnlineNow ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                    {presenceLabel}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleWriteMessage}
                    className="col-span-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <MessageCircle size={18} />
                    Чат
                  </button>
                  <button
                    type="button"
                    disabled
                    className="col-span-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground font-medium opacity-70 cursor-not-allowed"
                    aria-label="Звонок (скоро)"
                    title="Скоро"
                  >
                    <Phone size={18} />
                    Звонок
                  </button>
                  <button
                    type="button"
                    disabled
                    className="col-span-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground font-medium opacity-70 cursor-not-allowed"
                    aria-label="Видео (скоро)"
                    title="Скоро"
                  >
                    <Video size={18} />
                    Видео
                  </button>
                </div>

                <div className="mt-5 space-y-2">
                  {profile.birth_date ? (
                    <p className="text-sm text-muted-foreground">
                      Дата рождения: {formatBirthDateWithAge(profile.birth_date)}
                    </p>
                  ) : null}
                </div>

                {userId ? <PeerChatMediaGallery peerUserId={userId} /> : null}
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
