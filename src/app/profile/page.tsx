"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys, getChatKeysForUser, setChatKeys } from "@/lib/secureStorage";
import { chatAuthApi } from "@/services/chatAuthApi";
import { LogOut, Loader2, Pencil } from "lucide-react";
import NextImage from "next/image";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { fileToAvatarDataUrl } from "@/lib/avatarImage";

function getInitials(name: string): string {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
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
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasChatKeys, setHasChatKeys] = useState<boolean | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  /** Без `capture` — открывается галерея / выбор фото. */
  const avatarGalleryInputRef = useRef<HTMLInputElement | null>(null);

  const saveAvatar = async (dataUrl: string) => {
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) throw new Error("Нет access token");

    const updated = await chatAuthApi.updateMe(tokens.access_token, { avatar: dataUrl });
    setProfile(meToProfile(updated));
    await updateUser({ avatar: dataUrl });
  };

  const ingestAvatarFile = async (f: File) => {
    try {
      setAvatarError(null);
      setIsUploadingAvatar(true);
      if (f.size > 10 * 1024 * 1024) throw new Error("Файл слишком большой (макс 10MB)");
      const dataUrl = await fileToAvatarDataUrl(f);
      await saveAvatar(dataUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Ошибка загрузки аватара");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

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
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Загрузка...</p>
                </div>
              )}

              {loadError && !loading && (
                <div className="py-8 text-center">
                  <p className="text-destructive">{loadError}</p>
                </div>
              )}

              {user && !loading && (
                <>
                  <div className="flex flex-col items-center text-center mb-8">
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarError(null);
                        avatarGalleryInputRef.current?.click();
                      }}
                      className="relative w-24 h-24 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center font-medium text-3xl mb-4 ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
                      aria-label="Выбрать фото из галереи"
                      title="Выбрать фото из галереи"
                    >
                      {profile?.avatar ?? user.avatar ? (
                        <NextImage
                          src={(profile?.avatar ?? user.avatar) as string}
                          alt=""
                          width={96}
                          height={96}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        getInitials(displayName)
                      )}
                      {isUploadingAvatar ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                          <Loader2 className="w-8 h-8 animate-spin text-white" />
                        </span>
                      ) : null}
                    </button>
                    <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
                    <p className="text-sm mt-0.5 text-muted-foreground">Ваш профиль</p>
                  </div>

                  {avatarError ? (
                    <p className="text-destructive text-sm text-center -mt-4 mb-6">{avatarError}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => profile && setShowEditProfileModal(true)}
                    disabled={!profile}
                    className="mx-auto mb-2 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  >
                    <Pencil size={18} aria-hidden />
                    Изменить данные
                  </button>

                  {profile?.birth_date ? (
                    <div className="mt-5 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Дата рождения: {formatBirthDateWithAge(profile.birth_date)}
                      </p>
                    </div>
                  ) : null}

                  {hasChatKeys === false ? (
                    <div className="mt-5 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
                      <p className="font-medium text-amber-700 dark:text-amber-400">Нет ключей для чата</p>
                      <p className="mt-1 text-muted-foreground">
                        Ключи шифрования создаются при регистрации в этом приложении. Без них нельзя расшифровать сообщения. Войдите на устройстве, где регистрировались, или зарегистрируйтесь заново.
                      </p>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowLogoutModal(true);
                    }}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 px-4 py-3 text-muted-foreground hover:bg-muted/45 transition-colors"
                  >
                    <LogOut size={20} />
                    <span>Выйти</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </Layout>

        <ProfileEditModal
          isOpen={showEditProfileModal}
          onClose={() => setShowEditProfileModal(false)}
          source={profile}
          onSaved={(data) => {
            const p = meToProfile(data);
            setProfile(p);
            void updateUser({ name: p.name });
          }}
        />

        <input
          ref={avatarGalleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!f) return;
            await ingestAvatarFile(f);
          }}
        />

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
