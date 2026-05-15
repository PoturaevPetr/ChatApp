"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, Pencil, Users, Sparkles } from "lucide-react";
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
import { AI_ASSISTANT_NAME, AI_ASSISTANT_HREF } from "@/lib/aiAssistantConstants";
import { useAiAssistantListPreview } from "@/components/ai/AiAssistantThread";

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

function AiAssistantPinnedRow() {
  const { subtitle, timeLabel } = useAiAssistantListPreview();
  return (
    <li>
      <Link
        href={AI_ASSISTANT_HREF}
        className="flex items-center gap-3 border-b border-border bg-primary/[0.06] p-4 hover:bg-muted/50 active:bg-muted"
      >
        <div className="relative shrink-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/35 bg-primary/15 text-primary shadow-sm">
            <Sparkles className="h-6 w-6" aria-hidden />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{AI_ASSISTANT_NAME}</div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {timeLabel ? (
            <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
              <span className="text-xs tabular-nums leading-none text-muted-foreground">{timeLabel}</span>
            </div>
          ) : null}
        </div>
      </Link>
    </li>
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
  const realChatsEmpty = !listLoading && sorted.length === 0;

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
          <div className="flex flex-col">
            <ul className="divide-y divide-border">
              <AiAssistantPinnedRow />
            </ul>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Загрузка чатов…</p>
            </div>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              <AiAssistantPinnedRow />
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
                          className="h-12 w-12 rounded-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-medium text-primary"
                          style={{ fontSize: "1rem" }}
                        >
                          {getInitials(chat.otherUser.name)}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">{chat.otherUser.name}</div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {chat.lastMessage
                            ? lastMessagePreviewForList(chat.lastMessage, user.id, chat)
                            : "Нет сообщений"}
                        </p>
                      </div>
                      {chat.lastMessage ? (
                        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
                          <span className="text-xs leading-none text-muted-foreground tabular-nums">
                            {formatMessageTime(chat.lastMessage.timestamp)}
                          </span>
                          {chat.unreadCount > 0 ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium leading-none text-primary-foreground">
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
            {realChatsEmpty ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <MessageCircle size={28} className="text-muted-foreground" />
                </div>
                <p className="mb-1 font-medium text-foreground">Нет чатов с людьми</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Сверху — AI-помощник. Ниже можно начать обычный чат.
                </p>
                <button
                  type="button"
                  onClick={() => setStartChatOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground"
                >
                  <Pencil size={18} />
                  Начать чат
                </button>
              </div>
            ) : null}
          </>
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
