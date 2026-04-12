"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, Pencil } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useChatListPullToRefresh } from "@/hooks/useChatListPullToRefresh";
import { formatMessageTime, getMessagePreviewText, sortChatsWithUnreadFirst } from "@/utils/chatUtils";
import { StartChatModal } from "@/components/StartChatModal";
import Image from "next/image";

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ChatList() {
  const { user } = useAuthStore();
  const { chats, loadUsers, loadChats, isLoading, error } = useChatStore();
  const isSocketConnected = useWebSocketStore((s) => s.isConnected);
  const ensureConnected = useWebSocketStore((s) => s.ensureConnected);
  const [search, setSearch] = useState("");
  const [startChatOpen, setStartChatOpen] = useState(false);
  const listLoading = !isSocketConnected || isLoading;

  // Только при появлении пользователя: не вешать на isSocketConnected — при каждом
  // open/close эффект вызывал бы ensureConnected и усиливал гонки с WebSocketInitializer.
  useEffect(() => {
    if (!user?.id) return;
    void ensureConnected(user.id);
  }, [user?.id, ensureConnected]);

  useEffect(() => {
    if (user) {
      loadUsers();
    }
  }, [user?.id, loadUsers]);

  useChatListPullToRefresh(!!user, async () => {
    if (!user?.id) return;
    await loadChats(user.id, { force: true });
  });

  if (!user) return null;

  const filtered = chats.filter(
    (c) =>
      c.otherUser.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortChatsWithUnreadFirst(filtered);
  const isEmpty = !listLoading && sorted.length === 0;

  return (
    <div className="flex flex-col h-full position-relative">
      <div className="absolute right-2 border rounded-full p-2 bg-primary/60 text-white bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          onClick={() => setStartChatOpen(true)}
          className="p-2 rounded-lg hover:bg-muted hover:text-foreground"
          aria-label="Новый чат"
        >
          <Pencil size={20} />
        </button>
      </div>

      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Чаты</h1>

        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
        {error && (
          <div className="p-4 mx-4 mt-4 rounded-xl bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        {listLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mb-3" />
            <p className="text-sm text-muted-foreground">
              {!isSocketConnected ? "Ожидание соединения…" : "Загрузка чатов…"}
            </p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageCircle size={28} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">Нет чатов</p>
            <p className="text-sm text-muted-foreground mb-4">
              Список чатов пуст. Выберите пользователя и начните общение.
            </p>
            <button
              type="button"
              onClick={() => setStartChatOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium"
            >
              <Pencil size={18} />
              Начать чат
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((chat) => (
              <li key={chat.id}>
                <Link href={`/chat?userId=${encodeURIComponent(chat.otherUser.id)}`} className="flex items-center gap-3 p-4 hover:bg-muted/50 active:bg-muted">
                  <div className="relative shrink-0">
                    {chat.otherUser.avatar ? (
                      <Image
                        src={chat.otherUser.avatar}
                        alt=""
                        width={48}
                        height={48}
                        className="rounded-full object-cover w-12 h-12"
                        unoptimized
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium text-lg"
                        style={{ fontSize: "1rem" }}
                      >
                        {getInitials(chat.otherUser.name)}
                      </div>
                    )}
                    {chat.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                        {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">{chat.otherUser.name}</span>
                      {chat.lastMessage && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatMessageTime(chat.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {chat.lastMessage
                        ? getMessagePreviewText(chat.lastMessage.content)
                        : "Нет сообщений"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StartChatModal
        isOpen={startChatOpen}
        onClose={() => setStartChatOpen(false)}
      />
    </div>
  );
}
