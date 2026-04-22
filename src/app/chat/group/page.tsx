"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Loader2, UserMinus, Crown, LogOut } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { AttachFileModal } from "@/components/AttachFileModal";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { fileToAvatarDataUrl } from "@/lib/avatarImage";
import {
  getRooms,
  leaveRoom,
  patchGroupRoom,
  removeRoomMember,
  type Room,
  type RoomUser,
} from "@/services/chatRoomsApi";
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

function roleLabel(role?: string): string {
  if (role === "admin") return "Администратор";
  if (role === "moderator") return "Модератор";
  return "Участник";
}

function displayNameFromRoomUser(u: RoomUser, roomTitle: string): string {
  const parts = [u.last_name, u.first_name, u.middle_name].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ").trim();
  const t = roomTitle.trim();
  if (t) return t;
  const short = String(u.id).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}

function GroupProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId")?.trim() ?? null;
  const { user } = useAuthStore();
  const loadChats = useChatStore((s) => s.loadChats);

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reloadRoom = useCallback(async () => {
    if (!roomId) return;
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) return;
    const rooms = await getRooms(tokens.access_token);
    const r = rooms.find((x) => String(x.id) === roomId) ?? null;
    setRoom(r);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      setRoom(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) {
        if (!cancelled) setLoadError("Нет доступа");
        return;
      }
      try {
        const rooms = await getRooms(tokens.access_token);
        if (cancelled) return;
        const r = rooms.find((x) => String(x.id) === roomId) ?? null;
        if (!r) {
          setLoadError("Группа не найдена или вы не участник");
          setRoom(null);
        } else {
          setRoom(r);
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
  }, [roomId]);

  const title = (room?.name ?? "").trim() || "Группа";
  const avatar = typeof room?.avatar === "string" && room.avatar.trim() !== "" ? room.avatar : null;
  const createdBy = room?.created_by != null ? String(room.created_by) : "";
  const members =
    room?.users?.map((u) => ({
      id: String(u.id),
      name: displayNameFromRoomUser(u, title),
      avatar: u.avatar ?? null,
      role: typeof u.role === "string" ? u.role : undefined,
    })) ?? [];

  const currentUserId = user?.id != null ? String(user.id) : "";
  const me = members.find((m) => m.id === currentUserId);
  const isAdmin = me?.role === "admin";
  const isCreator = !!(currentUserId && createdBy && currentUserId === createdBy);

  const canRemove = (m: (typeof members)[0]): boolean => {
    if (!isAdmin) return false;
    if (m.id === currentUserId) return false;
    if (m.id === createdBy) return false;
    if (m.role === "admin" && currentUserId !== createdBy) return false;
    return true;
  };

  const handleRemove = async (memberId: string) => {
    if (!roomId) return;
    setActionError(null);
    setBusyId(memberId);
    try {
      const t = await getValidAuthTokens();
      if (!t?.access_token) {
        setActionError("Нет доступа");
        return;
      }
      await removeRoomMember(t.access_token, roomId, memberId);
      if (user?.id) void loadChats(user.id, { force: true });
      await reloadRoom();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Не удалось исключить");
    } finally {
      setBusyId(null);
    }
  };

  const handleLeave = async () => {
    if (!roomId || isLeaving) return;
    setIsLeaving(true);
    setActionError(null);
    try {
      const t = await getValidAuthTokens();
      if (!t?.access_token) return;
      await leaveRoom(t.access_token, roomId);
      if (user?.id) void loadChats(user.id, { force: true });
      setLeaveModalOpen(false);
      router.replace("/");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Не удалось выйти из группы");
    } finally {
      setIsLeaving(false);
    }
  };

  const openChat = () => {
    if (!roomId) return;
    router.push(`/chat?roomId=${encodeURIComponent(roomId)}`);
  };

  const ingestGroupAvatarFile = async (f: File) => {
    if (!roomId || !isAdmin) return;
    try {
      setAvatarError(null);
      setIsUploadingAvatar(true);
      if (f.size > 10 * 1024 * 1024) throw new Error("Файл слишком большой (макс 10 МБ)");
      const dataUrl = await fileToAvatarDataUrl(f);
      const t = await getValidAuthTokens();
      if (!t?.access_token) throw new Error("Нет доступа");
      await patchGroupRoom(t.access_token, roomId, { avatar: dataUrl });
      if (user?.id) void loadChats(user.id, { force: true });
      await reloadRoom();
      setShowAvatarModal(false);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Не удалось обновить фото группы");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-6">
            {!roomId ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">Не указана группа</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              </div>
            ) : loadError || !room ? (
              <div className="py-8 text-center">
                <p className="text-destructive">{loadError ?? "Группа не найдена"}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center text-center mb-8">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarError(null);
                        setShowAvatarModal(true);
                      }}
                      className="relative w-24 h-24 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center font-medium text-3xl mb-4 border border-border/60 ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
                      aria-label="Сменить фото группы"
                      title="Сменить фото группы"
                    >
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        getInitials(title)
                      )}
                      {isUploadingAvatar ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                          <Loader2 className="w-8 h-8 animate-spin text-white" aria-hidden />
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center font-medium text-3xl mb-4 border border-border/60">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        getInitials(title)
                      )}
                    </div>
                  )}
                  {avatarError ? (
                    <p className="text-destructive text-sm text-center -mt-2 mb-3 max-w-sm">{avatarError}</p>
                  ) : null}
                  <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                  <p className="text-sm mt-0.5 text-muted-foreground">
                    Групповой чат · {members.length}{" "}
                    {members.length === 1 ? "участник" : members.length < 5 ? "участника" : "участников"}
                  </p>
                  {room.description?.trim() ? (
                    <p className="mt-3 text-sm text-muted-foreground max-w-md text-center">{room.description.trim()}</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={openChat}
                    className="col-span-3 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <MessageCircle size={18} />
                    Открыть чат
                  </button>
                </div>

                <section className="mt-8">
                  <h3 className="text-sm font-semibold text-foreground">Участники</h3>
                  {actionError ? (
                    <p className="mt-2 text-sm text-destructive">{actionError}</p>
                  ) : null}
                  <ul className="mt-3 divide-y divide-border rounded-xl border border-border overflow-hidden bg-card/30">
                    {members.map((m) => {
                      const isCreatorMember = m.id === createdBy;
                      const removing = busyId === m.id;
                      return (
                        <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-11 w-11 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-medium shrink-0 overflow-hidden">
                            {m.avatar ? (
                              <img src={m.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              getInitials(m.name)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-foreground truncate">{m.name}</span>
                              {isCreatorMember ? (
                                <span className="inline-flex shrink-0" title="Создатель">
                                  <Crown className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">{roleLabel(m.role)}</p>
                          </div>
                          {canRemove(m) ? (
                            <button
                              type="button"
                              disabled={removing || busyId === "__leave__"}
                              onClick={() => void handleRemove(m.id)}
                              className="shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              aria-label={`Исключить ${m.name}`}
                              title="Исключить из группы"
                            >
                              {removing ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserMinus className="h-5 w-5" />}
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    type="button"
                    disabled={busyId != null}
                    onClick={() => setLeaveModalOpen(true)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <LogOut className="h-5 w-5" />
                    Покинуть группу
                  </button>
                  {isCreator ? (
                    <p className="mt-3 text-xs text-muted-foreground text-center">
                      Чтобы удалить группу для всех участников, откройте чат и выберите «Удалить для всех» в меню.
                    </p>
                  ) : null}
                </section>

                {roomId ? <PeerChatMediaGallery roomId={roomId} /> : null}
              </>
            )}
          </div>
        </div>

        {leaveModalOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              aria-label="Закрыть"
              onClick={() => !isLeaving && setLeaveModalOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Покинуть группу"
              className="relative w-full max-w-sm rounded-2xl border border-border bg-background shadow-xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-foreground">Покинуть группу?</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Вы перестанете видеть чат в списке. Остальные участники сохранят переписку.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  disabled={isLeaving}
                  className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  disabled={isLeaving}
                  className="rounded-xl bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-60"
                >
                  {isLeaving ? "Выход…" : "Покинуть"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <AttachFileModal
          isOpen={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          onTakePhoto={() => photoInputRef.current?.click()}
          onUploadFile={() => fileInputRef.current?.click()}
          onImageFile={(file) => void ingestGroupAvatarFile(file)}
        />

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!f) return;
            await ingestGroupAvatarFile(f);
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
            await ingestGroupAvatarFile(f);
          }}
        />
      </Layout>
    </AuthGuard>
  );
}

export default function GroupProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">Загрузка...</div>
      }
    >
      <GroupProfileContent />
    </Suspense>
  );
}
