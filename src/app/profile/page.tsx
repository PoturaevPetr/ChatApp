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
import { KeyRound, Loader2, LogOut, Pencil, Smartphone } from "lucide-react";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { KeyBackupModal } from "@/components/KeyBackupModal";
import { ProfileDevicesSheet } from "@/components/ProfileDevicesSheet";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileSettingsRow } from "@/components/profile/ProfileSettingsRow";
import { ProfileSettingsSection } from "@/components/profile/ProfileSettingsSection";
import { fileToAvatarDataUrl } from "@/lib/avatarImage";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

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
  return `${dateText} · ${age} лет`;
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
  const { user, logout, updateUser, needsKeyRestore } = useAuthStore();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasChatKeys, setHasChatKeys] = useState<boolean | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showKeyBackupModal, setShowKeyBackupModal] = useState(false);
  const [showDevicesSheet, setShowDevicesSheet] = useState(false);
  const [keyBackupMode, setKeyBackupMode] = useState<"create" | "restore">("create");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [appVersionText, setAppVersionText] = useState<string>("");
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const platform = Capacitor.getPlatform();
      if (Capacitor.isNativePlatform()) {
        const info = await App.getInfo().catch(() => null);
        if (cancelled) return;
        const version = (info?.version || "").trim();
        if (version) {
          setAppVersionText(`Версия ${version} (${platform})`);
          return;
        }
      }
      const webVersion = (process.env.NEXT_PUBLIC_APP_VERSION || "").trim();
      if (cancelled) return;
      setAppVersionText(webVersion ? `Версия ${webVersion} (web)` : `Платформа: ${platform}`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.name?.trim() || user?.name?.trim() || "Пользователь";
  const avatarUrl = profile?.avatar ?? user?.avatar ?? null;
  const birthDateLabel = profile?.birth_date ? formatBirthDateWithAge(profile.birth_date) : null;

  return (
    <AuthGuard requireAuth>
      <>
        <Layout>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 size={32} className="mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Загрузка профиля…</p>
                </div>
              ) : null}

              {loadError && !loading ? (
                <div className="py-12 text-center">
                  <p className="text-destructive">{loadError}</p>
                </div>
              ) : null}

              {user && !loading ? (
                <div className="mx-auto w-full max-w-lg space-y-8">
                  <ProfileHero
                    displayName={displayName}
                    avatarUrl={avatarUrl}
                    birthDateLabel={birthDateLabel}
                    isUploadingAvatar={isUploadingAvatar}
                    onAvatarClick={() => {
                      setAvatarError(null);
                      avatarGalleryInputRef.current?.click();
                    }}
                  />

                  {avatarError ? (
                    <p className="-mt-4 text-center text-sm text-destructive">{avatarError}</p>
                  ) : null}

                  <ProfileSettingsSection title="Аккаунт">
                    <ProfileSettingsRow
                      icon={Pencil}
                      label="Изменить данные"
                      subtitle="Имя, фамилия, дата рождения"
                      disabled={!profile}
                      onClick={() => profile && setShowEditProfileModal(true)}
                    />
                  </ProfileSettingsSection>

                  <ProfileSettingsSection title="Безопасность">
                    <ProfileSettingsRow
                      icon={KeyRound}
                      label="Резервная копия ключа"
                      subtitle="Шифрование сообщений на этом устройстве"
                      onClick={() => {
                        setKeyBackupMode(hasChatKeys ? "create" : "restore");
                        setShowKeyBackupModal(true);
                      }}
                    />
                    <ProfileSettingsRow
                      icon={Smartphone}
                      label="Устройства"
                      subtitle="Новые телефоны и другие устройства"
                      onClick={() => setShowDevicesSheet(true)}
                    />
                  </ProfileSettingsSection>

                  {hasChatKeys === false || needsKeyRestore ? (
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-300">Нет ключей для чата</p>
                      <p className="mt-1.5 text-muted-foreground">
                        Восстановите ключ из резервной копии или войдите на устройстве, где регистрировались.
                      </p>
                      <button
                        type="button"
                        className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600/90"
                        onClick={() => {
                          setKeyBackupMode("restore");
                          setShowKeyBackupModal(true);
                        }}
                      >
                        Восстановить ключ
                      </button>
                    </div>
                  ) : null}

                  <ProfileSettingsSection title="Сессия">
                    <ProfileSettingsRow
                      icon={LogOut}
                      label="Выйти"
                      destructive
                      showChevron={false}
                      onClick={() => setShowLogoutModal(true)}
                    />
                  </ProfileSettingsSection>

                  <p className="pb-2 text-center text-xs text-muted-foreground">
                    {appVersionText || "Версия приложения"}
                  </p>
                </div>
              ) : null}
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

        <KeyBackupModal
          open={showKeyBackupModal}
          initialMode={keyBackupMode}
          onClose={() => {
            setShowKeyBackupModal(false);
            void (async () => {
              const keys = await getChatKeys();
              setHasChatKeys(!!keys?.private_key);
            })();
          }}
        />

        <ProfileDevicesSheet open={showDevicesSheet} onClose={() => setShowDevicesSheet(false)} />
      </>
    </AuthGuard>
  );
}
