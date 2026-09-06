import Link from "next/link";
import { requirePermission } from "@/modules/authorization";
import { prisma } from "@/lib/db/client";
import { getRequestMessages, getRequestLocale } from "@/lib/i18n/server";
import { z } from "zod";
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await requirePermission("audit.read");
  const parsed = z.coerce.number().int().min(1).max(100000).safeParse((await searchParams).page ?? 1);
  const page = parsed.success ? parsed.data : 1;
  const records = await prisma.auditLog.findMany({ where: { organizationId: context.organizationId }, select: { id: true, action: true, targetType: true, targetId: true, occurredAt: true, actorUser: { select: { username: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 });
  const m = (await getRequestMessages()).operations; const locale = await getRequestLocale();
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8"><h1 className="text-3xl font-semibold">{m.audit}</h1><ol className="space-y-3">{records.slice(0,50).map(r => <li key={r.id} className="space-y-1 rounded border bg-white p-4 text-sm"><p className="font-medium">{r.action}</p><p>{r.actorUser?.username} · {r.occurredAt.toLocaleString(locale)}</p><p dir="ltr" className="break-all text-xs text-muted-foreground">{r.targetType} · {r.targetId}</p></li>)}</ol><nav className="flex gap-5">{page > 1 ? <Link href={`?page=${page - 1}`}>{m.previous}</Link> : null}{records.length > 50 ? <Link href={`?page=${page + 1}`}>{m.next}</Link> : null}</nav></main>;
}

