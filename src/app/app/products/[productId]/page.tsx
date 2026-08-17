import { notFound, redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { isProductLifecycleError } from "@/modules/products";
import { getProductLifecyclePageData } from "@/modules/products/server";
import type { ProductLifecyclePageData } from "@/modules/products/product-lifecycle.service";

import { ProductLifecycleControls } from "@/modules/products/product-lifecycle-controls";

const messages = getMessages(defaultLocale);

function formatTimestamp(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(defaultLocale)
    : messages.products.notSet;
}

export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  let data: ProductLifecyclePageData;
  try {
    data = await getProductLifecyclePageData(productId);
  } catch (error) {
    if (isFactoryFlowAuthError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      notFound();
    }
    if (isProductLifecycleError(error)) {
      notFound();
    }
    notFound();
  }

  const { product } = data;
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {messages.products.title}
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight"
            data-testid="product-detail-serial"
          >
            {product.serialNumber}
          </h1>
        </header>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.status}
              </dt>
              <dd data-testid="product-detail-status">
                {messages.products.statusValues[product.status]}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.version}
              </dt>
              <dd data-testid="product-detail-version">{product.version}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.currentWorker}
              </dt>
              <dd>
                {product.currentWorker?.displayName ?? messages.products.notSet}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.currentRole}
              </dt>
              <dd>{product.currentRole?.name ?? messages.products.notSet}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.currentLocation}
              </dt>
              <dd>
                {product.currentLocation?.name ?? messages.products.notSet}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.completedAt}
              </dt>
              <dd>{formatTimestamp(product.completedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.cancelledAt}
              </dt>
              <dd>{formatTimestamp(product.cancelledAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                {messages.products.trashedAt}
              </dt>
              <dd>{formatTimestamp(product.trashedAt)}</dd>
            </div>
          </dl>
        </section>

        <ProductLifecycleControls data={data} />
      </section>
    </main>
  );
}
