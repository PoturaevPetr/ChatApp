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
    /**
     * Иначе WebView блокирует ws:// к MeetService (LAN) при https-«происхождении» приложения
     * (androidScheme: https) — смешанный контент. В проде лучше wss:// на Meet.
     */
    allowMixedContent: true,
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
    /**
     * Android: при edge-to-edge / «полноэкранном» WebView клавиатура часто не ресайзит
     * layout — Visual Viewport даёт 0. Включён workaround из плагина + высота в JS (см. useVisualViewportKeyboardInset).
     * В AndroidManifest у Activity желательно windowSoftInputMode=adjustResize (не adjustPan), иначе WebView
     * «панорамирует» контент и строка ввода может уезжать вверх.
     * @see https://capacitorjs.com/docs/apis/keyboard
     */
    Keyboard: {
      resizeOnFullScreen: true,
    },
    /** Доступ к фото на всём устройстве (ряд превью в модалке вложений). */
    Media: {
      androidGalleryMode: true,
    },
    /** Нативный splash: белый фон; скрытие из JS после показа WebView-оверлея (см. NativeLaunchOverlay). */
    SplashScreen: {
      backgroundColor: "#ffffff",
      launchShowDuration: 8000,
      launchAutoHide: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
} as CapacitorConfig;

export default config;
