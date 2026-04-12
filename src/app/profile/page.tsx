"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";
import { AvatarUploadModal } from "@/components/AvatarUploadModal";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys, getChatKeysForUser, setChatKeys } from "@/lib/secureStorage";
import { chatAuthApi } from "@/services/chatAuthApi";
import { LogOut, Loader2, User, Calendar, ArrowLeft } from "lucide-react";
import NextImage from "next/image";
import { useRef } from "react";

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
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasChatKeys, setHasChatKeys] = useState<boolean | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editMiddleName, setEditMiddleName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState(""); // YYYY-MM-DD
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readFileAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(blob);
    });

  const fileToAvatarDataUrl = async (file: File): Promise<string> => {
    // Сжимаем/уменьшаем изображение, чтобы base64 влезал в localStorage и не был огромным.
    const MAX_SIDE = 256;
    const QUALITY = 0.85;

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new window.Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Не удалось загрузить изображение"));
        i.src = objectUrl;
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error("Некорректное изображение");

      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      const outW = Math.max(1, Math.round(w * scale));
      const outH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas недоступен");
      ctx.drawImage(img, 0, 0, outW, outH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Не удалось сжать изображение"))),
          "image/jpeg",
          QUALITY,
        );
      });

      // Дополнительная защита: если даже после сжатия слишком большой — просим выбрать другое.
      if (blob.size > 800 * 1024) {
        throw new Error("Аватар слишком большой даже после сжатия (выберите другое фото)");
      }

      return await readFileAsDataUrl(blob);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const saveAvatar = async (dataUrl: string) => {
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) throw new Error("Нет access token");

    const updated = await chatAuthApi.updateMe(tokens.access_token, { avatar: dataUrl });
    setProfile(meToProfile(updated));
    await updateUser({ avatar: dataUrl });
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

  // Синхронизируем поля редактирования только когда профиль загружен и мы НЕ в режиме редактирования.
  useEffect(() => {
    if (!profile || isEditing) return;
    setEditFirstName(profile.first_name ?? "");
    setEditLastName(profile.last_name ?? "");
    setEditMiddleName(profile.middle_name ?? "");
    setEditBirthDate(profile.birth_date ?? "");
  }, [profile, isEditing]);

  const startEditing = () => {
    if (!profile) return;
    setSaveError(null);
    setIsEditing(true);
    setEditFirstName(profile.first_name ?? "");
    setEditLastName(profile.last_name ?? "");
    setEditMiddleName(profile.middle_name ?? "");
    setEditBirthDate(profile.birth_date ?? "");
  };

  const cancelEditing = () => {
    setSaveError(null);
    setIsEditing(false);
    if (profile) {
      setEditFirstName(profile.first_name ?? "");
      setEditLastName(profile.last_name ?? "");
      setEditMiddleName(profile.middle_name ?? "");
      setEditBirthDate(profile.birth_date ?? "");
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaveError(null);

    const first = editFirstName.trim();
    const last = editLastName.trim();
    const middle = editMiddleName.trim();
    const birth = editBirthDate.trim();

    if (!first || !last) {
      setSaveError("Пожалуйста, заполните имя и фамилию");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      setSaveError("Пожалуйста, выберите корректную дату рождения");
      return;
    }

    try {
      setIsSaving(true);
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) throw new Error("Нет access token");

      const updated = await chatAuthApi.updateMe(tokens.access_token, {
        first_name: first,
        last_name: last,
        middle_name: middle || undefined,
        birth_date: birth,
      });

      setProfile(meToProfile(updated));
      setIsEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGuard requireAuth>
      <>
        <Layout>
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Назад"
              title="Назад"
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-semibold text-foreground">Профиль</h1>
          </div>

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
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarError(null);
                      setShowAvatarModal(true);
                    }}
                    className="shrink-0"
                    aria-label="Изменить аватар"
                    title="Изменить аватар"
                  >
                    {profile?.avatar ?? user.avatar ? (
                      <span className="relative block w-16 h-16">
                        <NextImage
                          src={(profile?.avatar ?? user.avatar) as string}
                          alt=""
                          width={64}
                          height={64}
                          className="rounded-full object-cover w-16 h-16 shrink-0"
                          unoptimized
                        />
                        {isUploadingAvatar && (
                          <span className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-2xl font-semibold shrink-0">
                        {displayName.slice(0, 2).toUpperCase() || "?"}
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-lg">{displayName}</p>
                  </div>

                  {!isEditing && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Редактировать
                    </button>
                  )}
                </div>

                {!isEditing ? (
                  <dl className="divide-y divide-border">
                    <InfoRow label="Фамилия" value={profile?.last_name} icon={<User size={18} className="text-muted-foreground" />} />
                    <InfoRow label="Имя" value={profile?.first_name} icon={<User size={18} className="text-muted-foreground" />} />
                    <InfoRow label="Отчество" value={profile?.middle_name} icon={<User size={18} className="text-muted-foreground" />} />
                    <InfoRow
                      label="Дата рождения"
                      value={formatBirthDate(profile?.birth_date)}
                      icon={<Calendar size={18} className="text-muted-foreground" />}
                    />
                  </dl>
                ) : (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="block text-sm font-medium text-foreground mb-1">Фамилия</span>
                        <input
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Иванов"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-foreground mb-1">Имя</span>
                        <input
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Иван"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="block text-sm font-medium text-foreground mb-1">Отчество</span>
                        <input
                          value={editMiddleName}
                          onChange={(e) => setEditMiddleName(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Иванович"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="block text-sm font-medium text-foreground mb-1">Дата рождения</span>
                        <input
                          type="date"
                          value={editBirthDate}
                          onChange={(e) => setEditBirthDate(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </label>
                    </div>

                    {saveError && <p className="text-destructive text-sm">{saveError}</p>}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="flex-1 rounded-xl border border-border bg-card px-4 py-2 text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveProfile()}
                        disabled={isSaving}
                        className="flex-1 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-60"
                      >
                        {isSaving ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Сохранение...
                          </span>
                        ) : (
                          "Сохранить"
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {avatarError && (
                  <div className="px-4 pb-4">
                    <p className="text-destructive text-sm">{avatarError}</p>
                  </div>
                )}
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

        <AvatarUploadModal
          isOpen={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          onTakePhoto={() => photoInputRef.current?.click()}
          onUploadFile={() => fileInputRef.current?.click()}
        />

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            // сбрасываем инпут, чтобы можно было выбрать один и тот же файл повторно
            e.currentTarget.value = "";
            if (!f) return;

            try {
              setAvatarError(null);
              setIsUploadingAvatar(true);
              if (f.size > 10 * 1024 * 1024) throw new Error("Файл слишком большой (макс 10MB)");
              const dataUrl = await fileToAvatarDataUrl(f);
              await saveAvatar(dataUrl);
              setShowAvatarModal(false);
            } catch (err) {
              setAvatarError(err instanceof Error ? err.message : "Ошибка загрузки аватара");
            } finally {
              setIsUploadingAvatar(false);
            }
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!f) return;

            try {
              setAvatarError(null);
              setIsUploadingAvatar(true);
              if (f.size > 10 * 1024 * 1024) throw new Error("Файл слишком большой (макс 10MB)");
              const dataUrl = await fileToAvatarDataUrl(f);
              await saveAvatar(dataUrl);
              setShowAvatarModal(false);
            } catch (err) {
              setAvatarError(err instanceof Error ? err.message : "Ошибка загрузки аватара");
            } finally {
              setIsUploadingAvatar(false);
            }
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
