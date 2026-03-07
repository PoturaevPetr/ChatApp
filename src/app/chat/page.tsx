"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { getDemoUsers } from "@/lib/storage";
import { formatMessageTime, groupMessagesByDate } from "@/utils/chatUtils";

function ChatThreadContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId")?.trim() ?? null;
  const nameFromQuery = searchParams.get("name")?.trim() ?? null;
  const { user } = useAuthStore();
  const {
    activeChatMessages,
    activeChatUser,
    setActiveChat,
    clearActiveChat,
    sendMessage,
    loadChats,
    loadUsers,
  } = useChatStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !userId) return;
    loadUsers();
    const all = getDemoUsers();
    const other = all.find((u) => u.id === userId);
    const displayName =
      nameFromQuery ||
      (other ? other.name : null) ||
      (userId ? `Пользователь ${String(userId).slice(0, 8)}` : "Пользователь");
    const otherUser = other
      ? { id: other.id, name: displayName, avatar: other.avatar ?? null }
      : { id: userId, name: displayName, avatar: null as string | null };
    setActiveChat(user.id, otherUser);
    return () => clearActiveChat();
  }, [user?.id, userId, nameFromQuery, setActiveChat, clearActiveChat, loadUsers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatMessages]);

  if (!user || !userId) {
    return (
      <AuthGuard requireAuth>
        <Layout>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p>Выберите чат или начните новый.</p>
            <Link href="/" className="mt-4 text-primary hover:underline">
              К списку чатов
            </Link>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(user.id, userId, text);
    setInput("");
    loadChats(user.id);
  };

  const displayName = activeChatUser?.name ?? "Пользователь";
  const groups = groupMessagesByDate(activeChatMessages);

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex flex-col h-full">
          <header className="shrink-0 flex items-center gap-3 p-4 border-b border-border bg-card">
            <Link
              href="/"
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Назад"
            >
              <ArrowLeft size={22} />
            </Link>
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium shrink-0">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-semibold text-foreground truncate">{displayName}</span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {groups.map(({ date, messages }) => (
              <div key={date}>
                <p className="text-center text-xs text-muted-foreground py-2">{date}</p>
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          msg.isOwn
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted text-foreground rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content?.text ?? ""}</p>
                        <p className={`text-xs mt-0.5 ${msg.isOwn ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {formatMessageTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 p-4 border-t border-border bg-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Сообщение..."
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 hover:enabled:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="Отправить"
              >
                <Send size={22} />
              </button>
            </form>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
          Загрузка...
        </div>
      }
    >
      <ChatThreadContent />
    </Suspense>
  );
}
