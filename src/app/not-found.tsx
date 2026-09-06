import Link from "next/link";
import { getRequestMessages } from "@/lib/i18n/server";
export default async function NotFound() {
  const m = (await getRequestMessages()).operations;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">{m.unavailable}</h1>
      <Link href="/app">{m.home}</Link>
    </main>
  );
}
