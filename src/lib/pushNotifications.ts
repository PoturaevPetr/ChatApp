"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { registerPushDevice } from "@/services/chatPushApi";

let listenersAttached = false;

/**
 * Запрос разрешения, регистрация в FCM и отправка токена на ChatService (Novu).
 * Безопасно вызывать после входа и при восстановлении сессии.
 */
export async function syncPushWithBackend(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (!listenersAttached) {
    listenersAttached = true;

    await PushNotifications.addListener("registration", async (t) => {
      const value = t.value;
      if (!value) return;
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      try {
        await registerPushDevice(
          tokens.access_token,
          value,
          Capacitor.getPlatform()
        );
      } catch (e) {
        console.warn("[Push] Failed to register device token with backend:", e);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[Push] registrationError:", err.error);
    });
  }

  const perm = await PushNotifications.checkPermissions();
  let status = perm.receive;
  if (status === "prompt") {
    const req = await PushNotifications.requestPermissions();
    status = req.receive;
  }
  if (status !== "granted") return;

  await PushNotifications.register();
}
