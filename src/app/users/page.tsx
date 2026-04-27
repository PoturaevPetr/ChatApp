"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { getDemoUsers } from "@/lib/storage";

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UsersPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setOthers(getDemoUsers().filter((u) => u.id !== user?.id));
  }, [user?.id]);

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Назад"
            >
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">Новый чат</h1>
          </div>
          {others.length === 0 ? (
            <div className="p-4 text-muted-foreground">Нет других пользователей.</div>
          ) : (
          <ul className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
            {others.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/?userId=${encodeURIComponent(u.id)}`)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 active:bg-muted text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium">
                    {getInitials(u.name)}
                  </div>
                  <span className="font-medium text-foreground">{u.name}</span>
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
