"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { searchUsers, type UserSearchItem } from "@/services/chatUsersApi";

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

interface StartChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartChatModal({ isOpen, onClose }: StartChatModalProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setResults(currentId ? list.filter((u) => String(u.id) !== currentId) : list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, user?.id]);

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
      setQuery("");
      setResults([]);
      setError(null);
    }, 300);
  }, [onClose]);

  const handleSelect = (u: UserSearchItem) => {
    handleClose();
    router.push(`/users/user?user_id=${u.id}`);
  };

  if (!isOpen && !animatingOut) return null;

  const showOpen = isOpen && !animatingOut && entered;
  const showClosed = animatingOut;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      aria-modal="true"
      role="dialog"
      aria-label="Начать чат"
    >
      <div
        className="flex flex-col h-full w-full transform transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: showClosed ? "translateY(100%)" : showOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <header className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Новый чат</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </header>

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
              placeholder="Поиск пользователей..."
              autoFocus
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => doSearch()}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50"
              aria-label="Искать"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Search size={20} />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8">
          {error && (
            <div className="py-4 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          {loading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Поиск...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Введите запрос и дождитесь завершения поиска или нажмите Enter
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(u)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 active:bg-muted text-left rounded-xl"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium text-lg shrink-0">
                      {getInitials(u.name ?? u.first_name ?? u.id)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {u.name ?? `Пользователь ${u.id.slice(0, 8)}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
