import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { defaultLocale, getMessages, locales, type Locale } from "./messages";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
export const getRequestLocale = cache(async (): Promise<Locale> => {
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredLocale: true },
    });
    if (user && locales.includes(user.preferredLocale as Locale))
      return user.preferredLocale as Locale;
  }
  const preference = (await cookies()).get("factoryflow-locale")?.value;
  return locales.includes(preference as Locale)
    ? (preference as Locale)
    : defaultLocale;
});
export async function getRequestMessages() {
  return getMessages(await getRequestLocale());
}
