
import { getRequestMessages } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { inspectProduct } from "@/modules/products/product-inspection.service";
import { BarcodePrint } from "@/modules/products/barcode-print";
export default async function PrintPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const data = await inspectProduct(productId);
  if (!data.capabilities.print) notFound();
  const m = (await getRequestMessages()).operations;
  return <main className="mx-auto max-w-xl space-y-6 px-4 py-8"><h1 className="text-3xl font-semibold">{data.product.printed ? m.reprint : m.print}</h1><BarcodePrint productId={productId} reprint={data.product.printed}/></main>;
}

