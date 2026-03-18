"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys, getChatKeysForUser, setChatKeys } from "@/lib/secureStorage";
import { chatAuthApi } from "@/services/chatAuthApi";
import { LogOut, Loader2, User, Calendar } from "lucide-react";
import Image from "next/image";

function formatBirthDate(value: string | undefined): string {
  if (!value?.trim()) return "—";
  const d = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  }
  return d;
}

/** Приводим ответ /auth/me к виду для отображения (ФИО, дата, аватар) */
interface ProfileDisplay {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
}
function meToProfile(me: {
  id?: string;
  user_id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
}): ProfileDisplay {
  const id = String(me.id ?? me.user_id ?? "");
  const parts = [me.last_name, me.first_name, me.middle_name].filter(Boolean) as string[];
  const name = parts.length > 0 ? parts.join(" ").trim() : (me.username ?? "Пользователь");
  return {
    id,
    name,
    first_name: me.first_name,
    last_name: me.last_name,
    middle_name: me.middle_name,
    birth_date: me.birth_date,
    avatar: me.avatar ?? null,
  };
}

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasChatKeys, setHasChatKeys] = useState<boolean | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (!user?.id) {
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
        setLoading(false);
        return;
      }
      try {
        const data = await chatAuthApi.getMe(tokens.access_token);
        let keys = await getChatKeys();
        if (!keys?.private_key && user?.id) {
          const userKeys = await getChatKeysForUser(user.id);
          if (userKeys?.private_key) {
            await setChatKeys(userKeys);
            keys = userKeys;
          }
        }
        if (!cancelled) {
          setProfile(meToProfile(data));
          setHasChatKeys(!!keys?.private_key);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const displayName = profile?.name?.trim() || user?.name?.trim() || "Пользователь";

  return (
    <AuthGuard requireAuth>
      <>
        <Layout>
          <div className="p-4 space-y-6">
          <h1 className="text-xl font-semibold text-foreground">Профиль</h1>

          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}

          {loadError && !loading && (
            <p className="text-destructive text-sm py-4">{loadError}</p>
          )}

          {user && !loading && (
            <>
              <div className="rounded-xl bg-card border border-border overflow-hidden">
                <div className="flex items-center gap-4 p-4 border-b border-border">
                  {profile?.avatar ?? user.avatar ? (
                    <Image
                      src={(profile?.avatar ?? user.avatar) as string}
                      alt=""
                      width={64}
                      height={64}
                      className="rounded-full object-cover w-16 h-16 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-2xl font-semibold shrink-0">
                      {displayName.slice(0, 2).toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-lg">{displayName}</p>
                  </div>
                </div>
                <dl className="divide-y divide-border">
                  <InfoRow label="Фамилия" value={profile?.last_name} icon={<User size={18} className="text-muted-foreground" />} />
                  <InfoRow label="Имя" value={profile?.first_name} icon={<User size={18} className="text-muted-foreground" />} />
                  <InfoRow label="Отчество" value={profile?.middle_name} icon={<User size={18} className="text-muted-foreground" />} />
                  <InfoRow label="Дата рождения" value={formatBirthDate(profile?.birth_date)} icon={<Calendar size={18} className="text-muted-foreground" />} />
                </dl>
              </div>

              {hasChatKeys === false && (
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
                  <p className="font-medium text-amber-700 dark:text-amber-400">Нет ключей для чата</p>
                  <p className="mt-1 text-muted-foreground">
                    Ключи шифрования создаются при регистрации в этом приложении. Без них нельзя расшифровать сообщения. Войдите на устройстве, где регистрировались, или зарегистрируйтесь заново.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowLogoutModal(true);
                }}
                className="flex items-center gap-2 w-full justify-center px-4 py-3 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <LogOut size={20} />
                <span>Выйти</span>
              </button>
            </>
          )}
        </div>
        </Layout>

        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onConfirm={async () => {
            setShowLogoutModal(false);
            await logout();
            router.push("/auth/");
          }}
        />
      </>
    </AuthGuard>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | undefined;
  icon?: React.ReactNode;
}) {
  const display = (value?.trim() ?? "") || "—";
  return (
    <div className="flex justify-between items-center gap-4 px-4 py-3">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="text-foreground text-right truncate">{display}</dd>
    </div>
  );
}
