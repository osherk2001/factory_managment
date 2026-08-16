import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { prisma } from "@/lib/db/client";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { requirePermission } from "@/modules/authorization/permission.service";

import { ProductCreationForm } from "@/modules/products/product-form";

const messages = getMessages(defaultLocale);

export default async function NewProductPage() {
  let context;
  try {
    context = await requirePermission("products.create");
  } catch (error) {
    if (isFactoryFlowAuthError(error) && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }

    notFound();
  }

  const [orders, productTypes] = await Promise.all([
    prisma.productionOrder.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, orderNumber: true },
    }),
    prisma.productType.findMany({
      where: { organizationId: context.organizationId, isActive: true },
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {messages.products.title}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.products.create}
          </h1>
        </div>
        <ProductCreationForm
          initialIdempotencyKey={randomUUID()}
          orders={orders.map((order) => ({
            id: order.id,
            label: order.orderNumber,
          }))}
          productTypes={productTypes.map((productType) => ({
            id: productType.id,
            label: `${productType.code} — ${productType.name}`,
          }))}
        />
      </section>
    </main>
  );
}
