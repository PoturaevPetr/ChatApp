/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />

import type { CapacitorConfig } from "@capacitor/cli";

const config = {
  appId: "com.kindred.messapp",
  appName: "Kindred",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  /**
   * Не включать встроенные margins Capacitor для edge-to-edge — их задаёт
   * @capawesome/capacitor-android-edge-to-edge-support (слушатель на WebView).
   */
  android: {
    adjustMarginsForEdgeToEdge: "disable",
  },
  plugins: {
    App: {
      allowBackButtonNavigation: true,
    },
    /**
     * Capacitor 8+ / SystemBars: отключить встроенные insets, чтобы не конфликтовать с EdgeToEdge.
     * На Capacitor 7 ключ просто игнорируется.
     */
    SystemBars: {
      insetsHandling: "disable",
    },
    /**
     * Android: отступы WebView от системных панелей + цвет подложки за контентом.
     * См. https://capawesome.io/plugins/android-edge-to-edge-support/
     */
    EdgeToEdge: {
      backgroundColor: "#f8f9fb",
    },
    /** Доступ к фото на всём устройстве (ряд превью в модалке вложений). */
    Media: {
      androidGalleryMode: true,
    },
  },
} as CapacitorConfig;

export default config;
