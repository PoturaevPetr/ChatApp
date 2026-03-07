"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";

export default function ProfilePage() {
  const { user } = useAuthStore();

  return (
    <AuthGuard requireAuth>
      <Layout>
        <div className="p-4 space-y-6">
          <h1 className="text-xl font-semibold text-foreground">Профиль</h1>
          {user && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-2xl font-semibold">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-foreground">{user.name}</p>
                <p className="text-sm text-muted-foreground">ID: {user.id}</p>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
