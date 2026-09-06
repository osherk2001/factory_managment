
import { getRequestMessages } from "@/lib/i18n/server";
import { requireSystemAdmin } from "@/modules/authorization";
import { prisma } from "@/lib/db/client";
import { ActionForm } from "@/components/action-form";
import { administrationAction } from "@/modules/administration/actions";
export default async function PlatformPage() {
  await requireSystemAdmin();
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { createdAt: "desc" }, take: 100 });
  const m = (await getRequestMessages()).operations;
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8"><h1 className="text-3xl font-semibold">{m.platform}</h1><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{m.newOrganization}</h2><ActionForm action={administrationAction} submit={m.create} testId="create-organization"><input type="hidden" name="operation" value="organization"/>
    {([["name",m.name],["slug",m.slug],["username",m.username],["password",m.password]] as const).map(([name,label]) => <label key={name} className="block text-sm">{label}<input name={name} required type={name === "password" ? "password" : "text"} autoComplete={name === "password" ? "new-password" : undefined} minLength={name === "password" ? 10 : 1} maxLength={name === "password" ? 256 : 100} className="mt-1 w-full rounded border p-2"/></label>)}
  </ActionForm></section><ul className="space-y-2">{organizations.map(o => <li className="rounded border bg-white p-4" key={o.id}>{o.name} · {o.slug}</li>)}</ul></main>;
}

