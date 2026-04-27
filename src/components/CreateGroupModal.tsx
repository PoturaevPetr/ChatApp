"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Search, Loader2, Users } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { searchUsers, type UserSearchItem } from "@/services/chatUsersApi";
import { assertImageFileForAvatar } from "@/lib/avatarImage";
import { createGroupRoom } from "@/services/chatRoomsApi";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

/** Только фамилия и имя (без отчества); если с API пришло только полное name — укорачиваем эвристикой для «Ф И О». */
function displayLastAndFirstName(u: UserSearchItem): string {
  const last = (u.last_name ?? "").trim();
  const first = (u.first_name ?? "").trim();
  if (last || first) {
    return [last, first].filter(Boolean).join(" ").trim();
  }
  const full = (u.name ?? "").trim();
  if (full) {
    const tokens = full.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) return `${tokens[0]} ${tokens[1]}`;
    return full;
  }
  return u.id.length >= 8 ? u.id.slice(0, 8) : u.id;
}

function memberChipLabel(u: UserSearchItem): string {
  return displayLastAndFirstName(u);
}

function memberChipInitials(u: UserSearchItem): string {
  return getInitials(memberChipLabel(u));
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchItem[]>([]);
  const [selected, setSelected] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** data URL аватара группы (необязательно) */
  const [groupAvatarDataUrl, setGroupAvatarDataUrl] = useState<string | null>(null);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEntered(false);
      const t = setTimeout(() => setEntered(true), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const doSearch = useCallback(async () => {
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) {
      setError("Нет доступа");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await searchUsers(tokens.access_token, query);
      const currentId = user?.id != null ? String(user.id) : "";
      const selectedIds = new Set(selected.map((s) => s.id));
      setResults(currentId ? list.filter((u) => String(u.id) !== currentId && !selectedIds.has(u.id)) : list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, user?.id, selected]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(doSearch, 400);
    return () => clearTimeout(t);
  }, [isOpen, query, doSearch]);

  const handleClose = useCallback(() => {
    setAnimatingOut(true);
    setTimeout(() => {
      onClose();
      setAnimatingOut(false);
      setName("");
      setQuery("");
      setResults([]);
      setSelected([]);
      setError(null);
      setGroupAvatarDataUrl(null);
    }, 300);
  }, [onClose]);

  const addMember = (u: UserSearchItem) => {
    if (selected.some((s) => s.id === u.id)) return;
    setSelected((prev) => [...prev, u]);
    setResults((r) => r.filter((x) => x.id !== u.id));
  };

  const removeMember = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCreate = async () => {
    const title = name.trim();
    if (!title) {
      setError("Введите название группы");
      return;
    }
    if (selected.length === 0) {
      setError("Добавьте хотя бы одного участника");
      return;
    }
    const tokens = await getValidAuthTokens();
    if (!tokens?.access_token) {
      setError("Нет доступа");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const room = await createGroupRoom(tokens.access_token, {
        name: title,
        memberUserIds: selected.map((s) => s.id),
        avatar: groupAvatarDataUrl ?? undefined,
      });
      handleClose();
      router.push(`/?roomId=${encodeURIComponent(room.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать группу");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen && !animatingOut) return null;

  const showOpen = isOpen && !animatingOut && entered;
  const showClosed = animatingOut;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      aria-modal="true"
      role="dialog"
      aria-label="Новая группа"
    >
      <div
        className="flex flex-col h-full w-full transform transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: showClosed ? "translateY(100%)" : showOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <header className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-5 w-5 text-primary shrink-0" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground truncate">Новая группа</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </header>

        <div className="shrink-0 p-4 space-y-3 border-b border-border">
          <label className="block text-sm text-muted-foreground">Аватар группы (необязательно)</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-primary/15 text-primary flex items-center justify-center text-lg font-medium shrink-0 overflow-hidden border border-border">
              {groupAvatarDataUrl ? (
                <img src={groupAvatarDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Users className="h-7 w-7 opacity-70" aria-hidden />
              )}
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <input
                type="file"
                accept="image/*"
                className="text-sm text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    assertImageFileForAvatar(f);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Нужно выбрать изображение");
                    return;
                  }
                  if (f.size > 2 * 1024 * 1024) {
                    setError("Изображение не больше 2 МБ");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const r = reader.result;
                    if (typeof r === "string") setGroupAvatarDataUrl(r);
                  };
                  reader.readAsDataURL(f);
                }}
              />
              {groupAvatarDataUrl ? (
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline self-start"
                  onClick={() => setGroupAvatarDataUrl(null)}
                >
                  Убрать фото
                </button>
              ) : null}
            </div>
          </div>
          <label className="block text-sm text-muted-foreground">Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Команда проекта"
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => removeMember(s.id)}
                  className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-muted text-sm max-w-full"
                >
                  <span className="relative shrink-0 w-8 h-8 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center text-xs font-medium border border-border/60">
                    {s.avatar ? (
                      <Image
                        src={s.avatar}
                        alt=""
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      memberChipInitials(s)
                    )}
                  </span>
                  <span className="truncate max-w-[min(200px,55vw)]">{memberChipLabel(s)}</span>
                  <span className="text-muted-foreground shrink-0" aria-hidden>
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 p-4">
          <div className="relative">
            <Search
              size={20}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Поиск людей для добавления…"
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-24">
          {error && (
            <div className="py-3 px-3 rounded-xl bg-destructive/10 text-destructive text-sm mb-3">{error}</div>
          )}
          {loading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Поиск…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Введите имя или username и выберите людей из списка
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addMember(u)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 active:bg-muted text-left rounded-xl"
                  >
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-primary/20 text-primary flex items-center justify-center font-medium text-lg shrink-0 border border-border/60">
                      {u.avatar ? (
                        <Image
                          src={u.avatar}
                          alt=""
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        memberChipInitials(u)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{memberChipLabel(u)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-border bg-background">
          <button
            type="button"
            disabled={submitting || !name.trim() || selected.length === 0}
            onClick={() => void handleCreate()}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {submitting ? "Создание…" : "Создать группу"}
          </button>
        </div>
      </div>
    </div>
  );
}
