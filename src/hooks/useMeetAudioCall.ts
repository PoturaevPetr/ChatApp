"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMeetServiceUrlOverride } from "@/lib/meetConfig";
import { meetUrlLikelyUnreachableOnDevice } from "@/lib/meetReachability";
import { MeetCallController, type MeetCallMedia, type MeetSnapshot } from "@/lib/meetCallController";
import type { MeetCallLogPayload } from "@/stores/chatStore";
import { fetchMeetServicePublicUrl } from "@/services/chatClientConfigApi";
import { getValidAuthTokens } from "@/lib/validAuthToken";

const initialSnap: MeetSnapshot = {
  phase: "idle",
  remoteStream: null,
  localStream: null,
  callConnectedAtMs: undefined,
  remoteHasVideo: false,
};

function applyMeetUrl(
  url: string | null,
  setMeetBaseUrl: (v: string | null) => void,
  setConfigError: (v: string | null) => void,
): void {
  if (!url?.trim()) {
    setMeetBaseUrl(null);
    setConfigError(null);
    return;
  }
  const unreachable = meetUrlLikelyUnreachableOnDevice(url);
  if (unreachable) {
    setMeetBaseUrl(null);
    setConfigError(unreachable);
    return;
  }
  setMeetBaseUrl(url);
  setConfigError(null);
}

export function useMeetAudioCall(
  threadReadyForMeet: boolean,
  localUserId?: string | null,
  onPersistCallLog?: (payload: MeetCallLogPayload, peerUserId: string) => void,
) {
  const [snap, setSnap] = useState<MeetSnapshot>(initialSnap);
  const [meetBaseUrl, setMeetBaseUrl] = useState<string | null>(() => {
    const o = getMeetServiceUrlOverride();
    const u = o?.trim() ? o : null;
    return u && !meetUrlLikelyUnreachableOnDevice(u) ? u : null;
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(() => {
    const o = getMeetServiceUrlOverride();
    return o?.trim() ? meetUrlLikelyUnreachableOnDevice(o) : null;
  });
  const ctrlRef = useRef<MeetCallController | null>(null);
  const persistRef = useRef(onPersistCallLog);
  persistRef.current = onPersistCallLog;

  useEffect(() => {
    if (!threadReadyForMeet) {
      const o = getMeetServiceUrlOverride();
      applyMeetUrl(o?.trim() ? o : null, setMeetBaseUrl, setConfigError);
      setConfigLoading(false);
      return;
    }
    const override = getMeetServiceUrlOverride();
    if (override?.trim()) {
      applyMeetUrl(override, setMeetBaseUrl, setConfigError);
      setConfigLoading(false);
      return;
    }
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);
    void getValidAuthTokens().then(async (tokens) => {
      if (cancelled) return;
      if (!tokens?.access_token) {
        applyMeetUrl(null, setMeetBaseUrl, setConfigError);
        setConfigLoading(false);
        return;
      }
      try {
        const url = await fetchMeetServicePublicUrl(tokens.access_token);
        if (!cancelled) {
          applyMeetUrl(url, setMeetBaseUrl, setConfigError);
        }
      } catch {
        if (!cancelled) {
          applyMeetUrl(null, setMeetBaseUrl, setConfigError);
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [threadReadyForMeet]);

  useEffect(() => {
    if (!threadReadyForMeet || !meetBaseUrl) {
      ctrlRef.current?.disconnect();
      ctrlRef.current = null;
      setSnap(initialSnap);
      return;
    }
    const getToken = () => getValidAuthTokens().then((t) => t?.access_token ?? null);
    const ctrl = new MeetCallController(meetBaseUrl, getToken, setSnap, {
      localUserId: (localUserId ?? "").trim(),
      onPersistCallLog: (p, peer) => persistRef.current?.(p, peer),
    });
    ctrlRef.current = ctrl;
    void ctrl.connect();
    return () => {
      ctrl.disconnect();
      ctrlRef.current = null;
    };
  }, [threadReadyForMeet, meetBaseUrl, localUserId]);

  const startCall = useCallback(async (peerUserId: string, roomId?: string | null, media: MeetCallMedia = "audio") => {
    await ctrlRef.current?.startOutgoing(peerUserId, roomId ?? undefined, media);
  }, []);

  const setLocalCameraEnabled = useCallback(async (enabled: boolean) => {
    await ctrlRef.current?.setLocalCameraEnabled(enabled);
  }, []);

  const acceptIncoming = useCallback(async (callId: string) => {
    await ctrlRef.current?.acceptIncoming(callId);
  }, []);

  const rejectIncoming = useCallback((callId: string) => {
    ctrlRef.current?.rejectIncoming(callId);
  }, []);

  const hangup = useCallback(() => {
    ctrlRef.current?.hangup();
  }, []);

  const meetCallsAvailable = !!meetBaseUrl?.trim();

  return useMemo(
    () => ({
      snapshot: snap,
      startCall,
      setLocalCameraEnabled,
      acceptIncoming,
      rejectIncoming,
      hangup,
      meetCallsAvailable,
      configLoading,
      configError,
    }),
    [
      snap,
      startCall,
      setLocalCameraEnabled,
      acceptIncoming,
      rejectIncoming,
      hangup,
      meetCallsAvailable,
      configLoading,
      configError,
    ],
  );
}
