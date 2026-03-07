"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, LogOut, User } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { WebSocketInitializer } from "@/components/WebSocketInitializer";

const nav = [
  { href: "/", label: "Чаты", icon: MessageCircle },
  { href: "/profile", label: "Профиль", icon: User },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <WebSocketInitializer />
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14">
          <span className="font-semibold text-foreground">ChatApp</span>
          {user && (
            <span className="text-sm text-muted-foreground truncate max-w-[140px]">{user.name}</span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto">{children}</main>

      <nav className="safe-area-pb border-t border-border bg-card">
        <div className="flex items-center justify-around h-14">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 px-6 py-2 rounded-lg transition-colors ${
                pathname === href || (href === "/" && pathname === "/chat")
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={22} />
              <span className="text-xs">{label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/auth/");
            }}
            className="flex flex-col items-center justify-center gap-0.5 px-4 py-2 text-muted-foreground hover:text-foreground"
            aria-label="Выйти"
          >
            <LogOut size={22} />
            <span className="text-xs">Выход</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
