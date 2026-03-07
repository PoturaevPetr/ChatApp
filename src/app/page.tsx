"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { ChatList } from "@/components/ChatList";

export default function HomePage() {
  return (
    <AuthGuard requireAuth>
      <Layout>
        <ChatList />
      </Layout>
    </AuthGuard>
  );
}
