"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { WebSocketInitializer } from "@/components/WebSocketInitializer";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const showBack =
    pathname === "/profile" ||
    pathname === "/profile/" ||
    pathname === "/chat" ||
    pathname === "/chat/";

  return (
    <div className="flex flex-col h-full bg-background">
      <WebSocketInitializer />
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
            <span className="font-semibold text-foreground truncate">ChatApp</span>
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

      <main className="flex-1 min-h-0 overflow-auto">{children}</main>
    </div>
  );
}
