"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PullToRefresh } from "capacitor-native-pull-to-refresh";

/**
 * Нативное pull-to-refresh (Android: SwipeRefreshLayout, iOS: UIRefreshControl).
 * На веб не активируется.
 */
export function useChatListPullToRefresh(enabled: boolean, onRefresh: () => Promise<void>) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;

    let listener: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    void (async () => {
      try {
        await PullToRefresh.enable();
      } catch (e) {
        console.warn("[PullToRefresh] enable failed:", e);
        return;
      }
      if (cancelled) return;

      try {
        listener = await PullToRefresh.addListener("state", async ({ refreshing }) => {
          if (!refreshing) return;
          if (busyRef.current) {
            try {
              await PullToRefresh.endRefreshing();
            } catch {
              /* */
            }
            return;
          }
          busyRef.current = true;
          try {
            await onRefreshRef.current();
          } catch (e) {
            console.warn("[PullToRefresh] refresh:", e);
          } finally {
            busyRef.current = false;
            try {
              await PullToRefresh.endRefreshing();
            } catch {
              /* */
            }
          }
        });
      } catch (e) {
        console.warn("[PullToRefresh] addListener failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          await listener?.remove();
        } catch {
          /* */
        }
        try {
          await PullToRefresh.removeAllListeners();
        } catch {
          /* */
        }
        try {
          await PullToRefresh.disable();
        } catch {
          /* */
        }
      })();
    };
  }, [enabled]);
}
