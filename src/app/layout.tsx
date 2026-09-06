import type { Metadata } from "next";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

import "./globals.css";

const messages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: messages.metadata.title,
  description: messages.metadata.description,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
