"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { WebSocketInitializer } from "@/components/WebSocketInitializer";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const isSocketConnected = useWebSocketStore((s) => s.isConnected);
  const pathname = usePathname();
  const router = useRouter();
  const isChatsListPage = pathname === "/" || pathname === "";
  const showBack =
    pathname === "/profile" ||
    pathname === "/profile/" ||
    pathname === "/chat" ||
    pathname === "/chat/" ||
    pathname === "/users/user" ||
    pathname === "/users/user/";
  const hideTopBar =
    pathname === "/chat" ||
    pathname === "/chat/" ||
    pathname === "/profile" ||
    pathname === "/profile/";

  return (
    <div className="flex flex-col h-full bg-background">
      <WebSocketInitializer />
      {!hideTopBar ? (
        <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2 min-w-0">
              {showBack && (
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="p-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
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
                >
                  <span className="truncate">Соединение</span>
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                </span>
              ) : (
                <span className="font-semibold text-foreground truncate">Kindred</span>
              )}
            </div>
            {user && (
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                aria-label="Профиль"
              >
                {user.avatar ? (
                  <Image
                    src={user.avatar}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded-full object-cover w-9 h-9"
                    unoptimized
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </Link>
            )}
          </div>
        </header>
      ) : null}

      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
    </div>
  );
}
