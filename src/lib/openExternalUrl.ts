/**
 * Открыть URL во внешнем браузере (Capacitor) или в новой вкладке (web).
 */
export async function openUrlInSystemBrowser(url: string): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    }
  } catch {
    /* плагин недоступен или ошибка */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
