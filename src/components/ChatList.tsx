"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, Pencil, Users } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useChatStore,
  isGroupThreadPeerId,
  type ChatListItem,
  type ChatMessage,
} from "@/stores/chatStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useChatListPullToRefresh } from "@/hooks/useChatListPullToRefresh";
import { formatMessageTime, getMessagePreviewText, sortChatsWithUnreadFirst } from "@/utils/chatUtils";
import { StartChatModal } from "@/components/StartChatModal";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { OutgoingReceiptTicks } from "@/components/chat/ChatMessageBubble";
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

function lastMessagePreviewForList(
  lastMessage: ChatMessage,
  currentUserId: string,
  chat: ChatListItem,
): string {
  const text = getMessagePreviewText(lastMessage.content, 50, currentUserId);
  const me = currentUserId.trim().toLowerCase();
  const own =
    lastMessage.isOwn ||
    (me.length > 0 && String(lastMessage.senderId ?? "").trim().toLowerCase() === me);

  const isGroup = chat.roomType === "group" || isGroupThreadPeerId(chat.otherUser.id);
  if (isGroup) {
    if (own) return `Вы: ${text}`;
    const sid = String(lastMessage.senderId ?? "").trim().toLowerCase();
    const fromMap = sid ? chat.memberShortNameByUserId?.[sid] : undefined;
    const senderLabel =
      fromMap && fromMap.trim().length > 0
        ? fromMap
        : sid.length >= 8
          ? `Участник ${sid.slice(0, 8)}`
          : "Участник";
    return `${senderLabel}: ${text}`;
  }

  return own ? `Вы: ${text}` : text;
}

function isOwnMessage(msg: ChatMessage, currentUserId: string): boolean {
  const me = currentUserId.trim().toLowerCase();
  return (
    msg.isOwn || (me.length > 0 && String(msg.senderId ?? "").trim().toLowerCase() === me)
  );
}

export type ChatListProps = {
  /** На нативе: при false отключается WebView pull-to-refresh (чтобы не мешал скроллу открытого чата). */
  allowNativePullToRefresh?: boolean;
};

export function ChatList({ allowNativePullToRefresh = true }: ChatListProps) {
  const { user } = useAuthStore();
  const { chats, loadUsers, loadChats, isLoading, error } = useChatStore();
  const ensureConnected = useWebSocketStore((s) => s.ensureConnected);
  const [search, setSearch] = useState("");
  const [startChatOpen, setStartChatOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  /** Сокет не нужен, чтобы показать кэш / последний список — спиннер только пока нет строк и идёт загрузка с API. */
  const listLoading = isLoading && chats.length === 0;

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

  useChatListPullToRefresh(!!user && allowNativePullToRefresh, async () => {
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
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Мобилка: fixed — всегда у низа вьюпорта; md+: absolute — низ колонки списка */}
      <div
        className="pointer-events-auto fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-2 z-40 flex flex-col gap-2 rounded-full border bg-primary/60 p-2 text-white md:absolute md:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:right-2"
        aria-label="Действия со списком чатов"
      >
        <button
          type="button"
          onClick={() => setStartChatOpen(true)}
          className="p-2 rounded-lg hover:bg-muted hover:text-foreground"
          aria-label="Новый чат"
        >
          <Pencil size={20} />
        </button>
        <button
          type="button"
          onClick={() => setCreateGroupOpen(true)}
          className="p-2 rounded-lg hover:bg-muted hover:text-foreground"
          aria-label="Новая группа"
          title="Новая группа"
        >
          <Users size={20} />
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
            <p className="text-sm text-muted-foreground">Загрузка чатов…</p>
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
                <Link
                  href={
                    isGroupThreadPeerId(chat.otherUser.id)
                      ? `/?roomId=${encodeURIComponent(chat.id)}`
                      : `/?userId=${encodeURIComponent(chat.otherUser.id)}`
                  }
                  className="flex items-center gap-3 p-4 hover:bg-muted/50 active:bg-muted"
                >
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
                  </div>
                  <div className="min-w-0 flex-1 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{chat.otherUser.name}</div>
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {chat.lastMessage
                          ? lastMessagePreviewForList(chat.lastMessage, user.id, chat)
                          : "Нет сообщений"}
                      </p>
                    </div>
                    {chat.lastMessage ? (
                      <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
                        <span className="text-xs text-muted-foreground tabular-nums leading-none">
                          {formatMessageTime(chat.lastMessage.timestamp)}
                        </span>
                        {chat.unreadCount > 0 ? (
                          <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center leading-none">
                            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                          </span>
                        ) : null}
                        {isOwnMessage(chat.lastMessage, user.id) ? (
                          <OutgoingReceiptTicks status={chat.lastMessage.status} variant="onClear" />
                        ) : null}
                      </div>
                    ) : null}
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
      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />
    </div>
  );
}
