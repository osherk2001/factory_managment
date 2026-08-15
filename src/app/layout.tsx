import type { Metadata } from "next";

import { defaultLocale, getMessages } from "@/lib/i18n";

import "./globals.css";

const messages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: messages.metadata.title,
  description: messages.metadata.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={defaultLocale} dir="rtl">
      <body>{children}</body>
    </html>
  );
}
