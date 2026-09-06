"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/modules/authorization";
import { prisma } from "@/lib/db/client";
import { locales } from "@/lib/i18n";
import { auth } from "@/auth";
import { ApplicationError } from "@/shared/errors";
import { formString } from "@/shared/actions/action-state";
export async function selectLocale(form: FormData) {
  const locale = z.enum(locales).safeParse(formString(form, "locale"));
  if (!locale.success) throw new ApplicationError("INVALID_INPUT", "Invalid locale");
  const session = await auth();
  if (session?.user?.id) { const user = await requireAuthenticatedUser(); await prisma.user.update({ where: { id: user.userId }, data: { preferredLocale: locale.data } }); }
  (await cookies()).set("factoryflow-locale", locale.data, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 });
  revalidatePath("/", "layout");
}
export async function selectOrganization(form: FormData) {
  const user = await requireAuthenticatedUser();
  const id = z.string().uuid().safeParse(formString(form, "organizationId"));
  if (!id.success) throw new ApplicationError("INVALID_INPUT", "Invalid organization");
  await prisma.$transaction(async database => {
    const member = await database.membership.findFirst({ where: { userId: user.userId, organizationId: id.data, status: "ACTIVE" }, select: { id: true } });
    if (!member) throw new ApplicationError("FORBIDDEN", "Organization unavailable");
    await database.user.update({ where: { id: user.userId }, data: { selectedOrganizationId: id.data } });
  });
  revalidatePath("/app", "layout");
}

