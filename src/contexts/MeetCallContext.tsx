"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore, isGroupThreadPeerId, type MeetCallLogPayload } from "@/stores/chatStore";
import { useMeetAudioCall } from "@/hooks/useMeetAudioCall";
import { MeetCallGlobalOverlays } from "@/components/MeetCallGlobalOverlays";

export type MeetCallContextValue = ReturnType<typeof useMeetAudioCall>;

export const MeetCallContext = createContext<MeetCallContextValue | null>(null);

export function MeetCallProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const persist = useCallback((p: MeetCallLogPayload, peerUserId: string) => {
    const uid = userId?.trim();
    const peer = peerUserId.trim();
    if (!uid || !peer || isGroupThreadPeerId(peer)) return;
    void useChatStore.getState().sendMessage(uid, peer, "", undefined, undefined, null, p);
  }, [userId]);

  const meet = useMeetAudioCall(!!userId, userId ?? undefined, persist);

  return (
    <MeetCallContext.Provider value={meet}>
      {children}
      <MeetCallGlobalOverlays />
    </MeetCallContext.Provider>
  );
}

export function useMeetCall(): MeetCallContextValue {
  const v = useContext(MeetCallContext);
  if (!v) {
    throw new Error("useMeetCall: нет MeetCallProvider (ожидается внутри Layout)");
  }
  return v;
}
