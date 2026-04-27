"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Редирект со старых ссылок /chat?… на главную с теми же query — список чатов остаётся смонтированным. */
function ChatRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/?${q}` : "/");
  }, [router, searchParams]);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      Открываю чат…
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Загрузка…</div>
      }
    >
      <ChatRedirectInner />
    </Suspense>
  );
}
