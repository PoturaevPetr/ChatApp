import { Capacitor } from "@capacitor/core";

/**
 * На физическом устройстве localhost / 127.0.0.1 — это сам телефон, не ПК с MeetService.
 */
export function meetUrlLikelyUnreachableOnDevice(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
      return "MeetService указан как localhost — на телефоне это не ваш ПК. В ChatService (.env) задайте MEET_SERVICE_PUBLIC_URL=http://IP_вашего_компьютера_в_Wi-Fi:8480 и перезапустите API.";
    }
  } catch {
    return "Некорректный URL MeetService.";
  }
  return null;
}
