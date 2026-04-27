"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { WebSocketInitializer } from "@/components/WebSocketInitializer";
import { useMediaMinMd } from "@/hooks/useMediaMinMd";
import { chatListSidebarMd } from "@/lib/chatListSidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const isWide = useMediaMinMd();
  const isFetchingChatList = useChatStore((s) => s.isFetchingChatList);
  const isSocketConnected = useWebSocketStore((s) => s.isConnected);
  const pathname = usePathname();
  const router = useRouter();
  const isChatsListPage = pathname === "/" || pathname === "";
  const isProfilePage = pathname === "/profile" || pathname === "/profile/";
  const showBack =
    pathname === "/profile" ||
    pathname === "/profile/" ||
    pathname === "/chat" ||
    pathname === "/chat/" ||
    pathname === "/chat/group" ||
    pathname.startsWith("/chat/group/") ||
    pathname === "/users/user" ||
    pathname === "/users/user/";
  /** Скрываем только отдельную страницу /chat (полноэкранная нить). Оверлей чата на главной — под шапкой, шапку не трогаем (без «дребезга»). */
  const hideTopBar = pathname === "/chat" || pathname === "/chat/";
  /** Не даём main скроллиться: иначе при фокусе в поле ввода клавиатура прокручивает main и строка ввода «улетает» вверх. */
  const chatMainNoScroll = hideTopBar;

  const homeSplitHeader = isChatsListPage && isWide;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <WebSocketInitializer />
      {!hideTopBar ? (
        <header
          className={
            homeSplitHeader
              ? "pointer-events-none absolute left-0 right-0 top-0 z-20 border-0 bg-transparent"
              : "sticky top-0 z-10 flex w-full border-b border-border bg-background"
          }
        >
          {homeSplitHeader ? (
              <div
                className={`pointer-events-auto flex h-14 min-w-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur ${chatListSidebarMd}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {showBack && (
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="p-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Назад"
                    >
                      <ArrowLeft size={24} />
                    </button>
                  )}
                  {user && !isSocketConnected ? (
                    <span
                      className="flex min-w-0 items-center gap-2 font-semibold text-foreground"
                      aria-live="polite"
                      aria-busy="true"
                      title="Список чатов может быть неактуален до подключения"
                    >
                      <span className="truncate">Соединение</span>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                    </span>
                  ) : user && isSocketConnected && isFetchingChatList ? (
                    <span
                      className="flex min-w-0 items-center gap-2 font-semibold text-foreground"
                      aria-live="polite"
                      aria-busy="true"
                      title="Загружается актуальный список чатов с сервера"
                    >
                      <span className="truncate">Обновление</span>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                    </span>
                  ) : (
                    <span className="truncate font-semibold text-foreground">Kindred</span>
                  )}
                </div>
                {user && !isProfilePage ? (
                  <Link
                    href="/profile"
                    className="flex shrink-0 items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    aria-label="Профиль"
                  >
                    {user.avatar ? (
                      <Image
                        src={user.avatar}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </Link>
                ) : null}
              </div>
          ) : (
            <div className="flex h-14 w-full min-w-0 items-center justify-between bg-card/80 px-4 backdrop-blur">
              <div className="flex min-w-0 items-center gap-2">
                {showBack && (
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="p-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Назад"
                  >
                    <ArrowLeft size={24} />
                  </button>
                )}
                {isChatsListPage && user && !isSocketConnected ? (
                  <span
                    className="flex min-w-0 items-center gap-2 font-semibold text-foreground"
                    aria-live="polite"
                    aria-busy="true"
                    title="Список чатов может быть неактуален до подключения"
                  >
                    <span className="truncate">Соединение</span>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                  </span>
                ) : isChatsListPage && user && isSocketConnected && isFetchingChatList ? (
                  <span
                    className="flex min-w-0 items-center gap-2 font-semibold text-foreground"
                    aria-live="polite"
                    aria-busy="true"
                    title="Загружается актуальный список чатов с сервера"
                  >
                    <span className="truncate">Обновление</span>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                  </span>
                ) : (
                  <span className="truncate font-semibold text-foreground">Kindred</span>
                )}
              </div>
              {user && !isProfilePage ? (
                <Link
                  href="/profile"
                  className="flex shrink-0 items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  aria-label="Профиль"
                >
                  {user.avatar ? (
                    <Image
                      src={user.avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </Link>
              ) : null}
            </div>
          )}
        </header>
      ) : null}

      <main
        className={`flex-1 min-h-0 ${chatMainNoScroll ? "overflow-hidden" : "overflow-auto"}`}
      >
        {children}
      </main>
    </div>
  );
}
