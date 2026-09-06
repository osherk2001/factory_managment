import { getRequestMessages } from "@/lib/i18n/server";
import Link from "next/link";
import { defaultLocale } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import {
  createIssueAction,
  resolveIssueAction,
} from "@/modules/issues/actions";
import {
  recordWeightAction,
  correctWeightAction,
} from "@/modules/weights/actions";
import type { inspectProduct } from "./product-inspection.service";
import { productOperationsAction } from "./operations-actions";

export async function ProductInspection({
  data,
}: {
  data: Awaited<ReturnType<typeof inspectProduct>>;
}) {
  const m = await getRequestMessages();
  const o = m.operations;
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(defaultLocale) : m.products.notSet;
  return (
    <div className="space-y-6">
      {data.capabilities.update && data.product.status !== "TRASHED" ? (
        <details className="rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-medium">
            {o.updateProduct}
          </summary>
          <ActionForm action={productOperationsAction} submit={o.save}>
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="productId" value={data.product.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={data.product.version}
            />
            <label className="block text-sm">
              <input
                type="checkbox"
                name="isUrgent"
                value="true"
                defaultChecked={data.product.isUrgent}
              />{" "}
              {o.urgent}
            </label>
            <label className="block text-sm">
              {o.target}
              <input
                name="targetAt"
                type="date"
                defaultValue={data.product.targetAt?.slice(0, 10) ?? ""}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
          </ActionForm>
        </details>
      ) : null}
      {data.capabilities.transfer &&
      ["CREATED", "READY_FOR_HANDOFF"].includes(data.product.status) ? (
        <details className="rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-medium">{o.transfer}</summary>
          <p className="my-3 text-sm">{o.transferHint}</p>
          <ActionForm action={productOperationsAction} submit={o.transfer}>
            <input type="hidden" name="operation" value="transfer" />
            <input type="hidden" name="productId" value={data.product.id} />
            <input
              type="hidden"
              name="expectedVersion"
              value={data.product.version}
            />
            <label className="block text-sm">
              {o.location}
              <select
                name="locationId"
                required
                className="mt-1 w-full rounded border p-2"
              >
                {data.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              {o.reason}
              <textarea
                name="reason"
                required
                maxLength={5000}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
          </ActionForm>
        </details>
      ) : null}
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">{o.details}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            [o.order, data.product.order],
            [o.customer, data.product.customer],
            [m.products.productType, data.product.productType],
            [o.created, date(data.product.createdAt)],
            [o.target, date(data.product.targetAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value ?? m.products.notSet}</dd>
            </div>
          ))}
        </dl>
        {data.product.isUrgent ? (
          <p className="font-medium text-amber-800">{o.urgent}</p>
        ) : null}
        {data.capabilities.print ? (
          <Link
            className="inline-block rounded-md border px-4 py-2"
            href={`/app/products/${data.product.id}/print`}
          >
            {data.product.printed ? o.reprint : o.print}
          </Link>
        ) : null}
      </section>
      {data.issues || data.capabilities.createIssue ? (
        <section
          className="space-y-5 rounded-xl border bg-white p-5"
          data-testid="product-issues"
        >
          <h2 className="text-xl font-semibold">{o.issues}</h2>
          {data.issues?.map((issue) => (
            <article
              key={issue.id}
              className="space-y-2 rounded-lg border p-3"
              data-testid="issue"
            >
              <h3 className="font-medium">
                {issue.type} · {o[issue.status]}
              </h3>
              <p className="whitespace-pre-wrap text-sm">{issue.description}</p>
              <p className="text-xs text-muted-foreground">
                {issue.reportedBy.username} · {date(issue.createdAt)}
              </p>
              {issue.resolvedAt ? (
                <p className="text-sm">
                  {issue.resolvedBy?.username} · {date(issue.resolvedAt)} ·{" "}
                  {issue.resolution}
                </p>
              ) : data.capabilities.resolveIssue ? (
                <ActionForm action={resolveIssueAction} submit={o.resolve}>
                  <input type="hidden" name="issueId" value={issue.id} />
                  <label className="block text-sm">
                    {o.resolution}
                    <textarea
                      name="resolution"
                      maxLength={5000}
                      className="mt-1 w-full rounded border p-2"
                    />
                  </label>
                </ActionForm>
              ) : null}
            </article>
          ))}
          {data.capabilities.createIssue ? (
            <ActionForm
              action={createIssueAction}
              submit={o.reportIssue}
              testId="create-issue"
            >
              <input type="hidden" name="productId" value={data.product.id} />
              <label className="block text-sm">
                {o.issueType}
                <input
                  name="type"
                  required
                  maxLength={100}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="block text-sm">
                {o.description}
                <textarea
                  name="description"
                  maxLength={5000}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            </ActionForm>
          ) : null}
        </section>
      ) : null}
      {data.weights || data.capabilities.recordWeight ? (
        <section
          className="space-y-5 rounded-xl border bg-white p-5"
          data-testid="product-weights"
        >
          <h2 className="text-xl font-semibold">{o.weights}</h2>
          {data.weights ? (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(data.weights.summary).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">
                      {o[key as keyof typeof data.weights.summary]}
                    </dt>
                    <dd dir="ltr">{value} g</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">{o.materialHint}</p>
              <ol className="space-y-2">
                {data.weights.events.map((e) => (
                  <li key={e.id} className="rounded border p-3 text-sm">
                    {o[e.type]} · <b dir="ltr">{e.grams} g</b> ·{" "}
                    {date(e.occurredAt)}
                    <p className="whitespace-pre-wrap">{e.note}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {data.capabilities.recordWeight ? (
            <ActionForm
              action={recordWeightAction}
              submit={o.recordWeight}
              testId="record-weight"
            >
              <input type="hidden" name="productId" value={data.product.id} />
              <label className="block text-sm">
                {o.weightType}
                <select name="type" className="mt-1 w-full rounded border p-2">
                  {(
                    [
                      "EXPECTED",
                      "ISSUED",
                      "FINAL",
                      "RETURNED",
                      "APPROVED_LOSS",
                    ] as const
                  ).map((t) => (
                    <option key={t} value={t}>
                      {o[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {o.grams}
                <input
                  dir="ltr"
                  name="grams"
                  inputMode="decimal"
                  required
                  pattern="[0-9]{1,7}([.][0-9]{1,3})?"
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
              <label className="block text-sm">
                {o.note}
                <textarea
                  name="note"
                  maxLength={5000}
                  className="mt-1 w-full rounded border p-2"
                />
              </label>
            </ActionForm>
          ) : null}
          {data.capabilities.correctWeight &&
          data.weights?.events.some((e) => e.type !== "CORRECTION") ? (
            <details>
              <summary className="cursor-pointer font-medium">
                {o.correctWeight}
              </summary>
              <p className="my-3 text-sm">{o.correctionHint}</p>
              <ActionForm
                action={correctWeightAction}
                submit={o.correctWeight}
                testId="correct-weight"
              >
                <input type="hidden" name="productId" value={data.product.id} />
                <label className="block text-sm">
                  {o.correctionTarget}
                  <select
                    name="correctsWeightEventId"
                    className="mt-1 w-full rounded border p-2"
                  >
                    {data.weights.events
                      .filter((e) => e.type !== "CORRECTION")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {o[e.type]} · {e.grams} · {date(e.occurredAt)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {o.grams}
                  <input
                    dir="ltr"
                    name="grams"
                    inputMode="decimal"
                    required
                    className="mt-1 w-full rounded border p-2"
                  />
                </label>
                <label className="block text-sm">
                  {o.reason}
                  <textarea
                    name="note"
                    required
                    maxLength={5000}
                    className="mt-1 w-full rounded border p-2"
                  />
                </label>
              </ActionForm>
            </details>
          ) : null}
        </section>
      ) : null}
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">{o.history}</h2>
        <ol className="space-y-3" data-testid="product-history">
          {data.transitions.map((t) => (
            <li key={t.id} className="space-y-1 border-s-2 ps-4 text-sm">
              <p className="font-medium">{t.eventType}</p>
              <p>
                {date(t.occurredAt)} · {t.actor}
              </p>
              <p>
                {t.fromStatus
                  ? m.products.statusValues[t.fromStatus]
                  : m.products.notSet}{" "}
                →{" "}
                {t.toStatus
                  ? m.products.statusValues[t.toStatus]
                  : m.products.notSet}
              </p>
              <p>
                {t.fromWorker} {t.fromRole} {t.fromLocation} → {t.toWorker}{" "}
                {t.toRole} {t.toLocation}
              </p>
              <p>{t.reason}</p>
            </li>
          ))}
        </ol>
        <h2 className="text-xl font-semibold">{o.assignments}</h2>
        <ol className="space-y-3">
          {data.assignments.map((a) => (
            <li key={a.id} className="rounded border p-3 text-sm">
              <p>
                {a.worker} · {a.role} · {a.location}
              </p>
              <p>
                {o.started}: {date(a.startedAt)} · {o.ended}: {date(a.endedAt)}
              </p>
            </li>
          ))}
        </ol>
        <nav className="flex gap-4">
          {data.page > 1 ? (
            <Link href={`?historyPage=${data.page - 1}`}>{o.previous}</Link>
          ) : null}
          {data.hasMore ? (
            <Link href={`?historyPage=${data.page + 1}`}>{o.next}</Link>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
