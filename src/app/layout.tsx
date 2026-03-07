import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ChatApp",
  description: "Обмен сообщениями между пользователями",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans h-full antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
