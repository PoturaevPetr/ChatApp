"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import { ChatList } from "@/components/ChatList";
import { ChatThreadScreen } from "@/components/chat/ChatThreadScreen";
import {
  CHAT_OVERLAY_CLOSE_EVENT,
  CHAT_OVERLAY_SLIDE_MS,
  consumeNextChatOverlayOpenWithoutSlide,
} from "@/lib/chatOverlayEvents";
import { useMediaMinMd } from "@/hooks/useMediaMinMd";
import { chatListSidebarMd } from "@/lib/chatListSidebar";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWide = useMediaMinMd();
  const threadOverlayOpen = !!(
    searchParams.get("roomId")?.trim() || searchParams.get("userId")?.trim()
  );

  const [slideEntered, setSlideEntered] = useState(false);
  const [slideExiting, setSlideExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!threadOverlayOpen) {
      setSlideEntered(false);
      setSlideExiting(false);
      return;
    }
    setSlideExiting(false);
    if (isWide || consumeNextChatOverlayOpenWithoutSlide()) {
      setSlideEntered(true);
      return;
    }
    setSlideEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [threadOverlayOpen, isWide]);

  const finishCloseAfterAnimation = useCallback(() => {
    if (exitTimerRef.current != null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (isWide) {
      setSlideExiting(false);
      router.replace("/");
      return;
    }
    setSlideExiting(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      router.replace("/");
    }, CHAT_OVERLAY_SLIDE_MS);
  }, [router, isWide]);

  useEffect(() => {
    const onRequestClose = () => finishCloseAfterAnimation();
    window.addEventListener(CHAT_OVERLAY_CLOSE_EVENT, onRequestClose);
    return () => {
      window.removeEventListener(CHAT_OVERLAY_CLOSE_EVENT, onRequestClose);
      if (exitTimerRef.current != null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [finishCloseAfterAnimation]);

  const overlayTransform =
    slideExiting || !slideEntered ? "translateX(100%)" : "translateX(0)";

  const mobileSlideStyle =
    !isWide && threadOverlayOpen
      ? {
          transform: overlayTransform,
          transitionDuration: `${CHAT_OVERLAY_SLIDE_MS}ms`,
        }
      : undefined;

  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <aside
          className={`relative flex min-h-0 w-full min-w-0 shrink-0 flex-col md:h-full md:pt-14 ${chatListSidebarMd}`}
        >
          <ChatList allowNativePullToRefresh={!threadOverlayOpen} />
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!threadOverlayOpen ? (
            <div className="hidden min-h-0 flex-1 flex-col items-center justify-center border-border bg-muted/15 px-6 text-center text-sm text-muted-foreground md:flex md:border-l">
              Выберите чат в списке слева
            </div>
          ) : null}

          {threadOverlayOpen ? (
            <div
              className="flex min-h-0 flex-1 flex-col overscroll-contain bg-background max-md:fixed max-md:inset-0 max-md:z-50 max-md:transition-transform max-md:ease-in-out max-md:will-change-transform md:relative md:z-0 md:translate-x-0 md:transition-none md:will-change-auto"
              style={mobileSlideStyle}
              aria-modal={isWide ? undefined : "true"}
              role="dialog"
              aria-label="Переписка"
            >
              <ChatThreadScreen mode="embedded" />
            </div>
          ) : null}
        </section>
      </div>
    </Layout>
  );
}

export default function HomePage() {
  return (
    <AuthGuard requireAuth>
      <Suspense
        fallback={
          <Layout>
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Загрузка…
            </div>
          </Layout>
        }
      >
        <HomeInner />
      </Suspense>
    </AuthGuard>
  );
}
