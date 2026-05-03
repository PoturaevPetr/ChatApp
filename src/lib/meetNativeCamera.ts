/**
 * На нативных платформах перед getUserMedia(video) запрашиваем разрешение камеры через Capacitor.
 */
export async function ensureNativeCameraForMeetCall(): Promise<void> {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { Camera } = await import("@capacitor/camera");
  const r = await Camera.requestPermissions({ permissions: ["camera"] });
  if (r.camera !== "granted") {
    throw new Error("Нет доступа к камере для видеозвонка");
  }
}
