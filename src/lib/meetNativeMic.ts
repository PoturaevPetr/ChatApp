/**
 * На Android/iOS WebView getUserMedia не всегда показывает тот же системный запрос,
 * что и capacitor-audio-engine. Перед WebRTC-звонком явно запрашиваем микрофон через плагин.
 */
export async function ensureNativeMicrophoneForMeetCall(): Promise<void> {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { CapacitorAudioEngine } = await import("capacitor-audio-engine");
  const r = await CapacitorAudioEngine.requestPermissionMicrophone({
    showRationale: true,
    rationaleMessage: "Для аудиозвонка в чате нужен доступ к микрофону.",
  });
  if (!r.granted) {
    throw new Error("Нет доступа к микрофону для звонка");
  }
}
