
import { getRequestMessages } from "@/lib/i18n/server";
import { requirePermission, getPermissionsForMembership } from "@/modules/authorization";
export default async function ReportsPage() {
  const context = await requirePermission("reports.export");
  const permissions = await getPermissionsForMembership(context);
  const o = (await getRequestMessages()).operations;
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8"><h1 className="text-3xl font-semibold">{o.reports}</h1><p className="text-sm text-muted-foreground">{o.reportLimit}</p>
    {permissions.has("products.read") ? <form action="/app/reports/export" className="space-y-4 rounded-xl border bg-white p-5">
      <label className="block">{o.reports}<select name="kind" className="mt-1 w-full rounded border p-2"><option value="operational">{o.operationalReport}</option>{permissions.has("weights.read") ? <option value="material">{o.materialReport}</option> : null}</select></label>
      <label className="block">{o.search}<input name="q" maxLength={200} className="mt-1 w-full rounded border p-2"/></label>
      <div className="grid grid-cols-2 gap-3"><label>{o.from}<input type="date" name="from" className="mt-1 w-full rounded border p-2"/></label><label>{o.to}<input type="date" name="to" className="mt-1 w-full rounded border p-2"/></label></div>
      <button className="rounded bg-primary px-4 py-3 text-primary-foreground">{o.export}</button>
    </form> : <p>{o.unavailable}</p>}
  </main>;
}

