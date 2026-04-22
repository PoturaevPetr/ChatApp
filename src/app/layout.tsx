import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NativeBootLayer } from "@/components/NativeBootLayer";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Kindred",
  description: "Обмен сообщениями между пользователями",
};

/** Нужен для env(safe-area-inset-*) — нижняя панель не уезжает под жесты ОС / home indicator */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /** Виртуальная клавиатура меняет visual viewport — лучше согласуется с innerHeight/vv на Android Chrome. */
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Permissions-Policy" content="microphone=(self)" />
      </head>
      <body className={`${inter.variable} font-sans h-full antialiased`} suppressHydrationWarning>
        <NativeBootLayer>{children}</NativeBootLayer>
      </body>
    </html>
  );
}
