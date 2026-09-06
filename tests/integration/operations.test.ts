import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../../src/auth", () => ({ auth: vi.fn() }));
import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import { makeFactory, makeActor, cleanupFactory } from "../helpers/factory";
import { createProduct } from "../../src/modules/products/server";
import { createIssue, resolveIssue, listProductIssues } from "../../src/modules/issues/server";
import { recordWeightEvent, correctWeightEvent, getProductWeightHistory } from "../../src/modules/weights/server";
import { listOperationalProducts, getOperationalDashboard } from "../../src/modules/reports/operations.service";
import { exportProductReport } from "../../src/modules/reports/report.service";
import { prepareBarcodePrint } from "../../src/modules/products/barcode-print.service";
import { updateProductOperations } from "../../src/modules/products/product-operations.service";
import { consumeRateLimit } from "../../src/lib/security/rate-limit";
let a: { id: string }; let b: { id: string };
let manager: Awaited<ReturnType<typeof makeActor>>;
let viewer: Awaited<ReturnType<typeof makeActor>>;
let foreign: Awaited<ReturnType<typeof makeActor>>;
let product: Awaited<ReturnType<typeof createProduct>>;
let otherProduct: Awaited<ReturnType<typeof createProduct>>;
const session = (actor: typeof manager) => vi.mocked(auth).mockResolvedValue({ user: { id: actor.user.id, username: actor.user.username }, expires: new Date(Date.now()+60000).toISOString() } as never);
describe.sequential("MVP issues, materials and manager operations", () => {
  beforeAll(async () => {
    a = await makeFactory("Operations A"); b = await makeFactory("Operations B");
    manager = await makeActor(a.id); viewer = await makeActor(a.id, ["products.read"]); foreign = await makeActor(b.id);
    session(manager); product = await createProduct({ idempotencyKey: randomUUID() });
    session(foreign); otherProduct = await createProduct({ idempotencyKey: randomUUID() });
  });
  beforeEach(() => session(manager));
  afterAll(async () => { if (a) await cleanupFactory(a.id); if (b) await cleanupFactory(b.id); await prisma.$disconnect(); });
  it("records one issue on concurrent duplicate delivery and rejects changed requests", async () => {
    const input = { productId: product.id, type: "בדיקה", description: "Inspect", idempotencyKey: randomUUID() };
    const [first, retry] = await Promise.all([createIssue(input), createIssue(input)]);
    expect(retry).toEqual(first);
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, targetId: first.id, action: "issue.created" } })).toBe(1);
    await expect(createIssue({ ...input, type: "Changed" })).rejects.toMatchObject({ code: "ISSUE_IDEMPOTENCY_CONFLICT" });
    const results = await Promise.allSettled([resolveIssue({ issueId: first.id, resolution: "Repaired", idempotencyKey: randomUUID() }), resolveIssue({ issueId: first.id, resolution: "Other", idempotencyKey: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, targetId: first.id, action: "issue.resolved" } })).toBe(1);
    expect((await listProductIssues(product.id))[0]?.status).toBe("RESOLVED");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe("CREATED");
  });
  it("calculates decimal material totals and preserves correction history", async () => {
    const input = { productId: product.id, type: "ISSUED" as const, grams: "0.100", idempotencyKey: randomUUID() };
    const [issued, retry] = await Promise.all([recordWeightEvent(input), recordWeightEvent(input)]);
    expect(retry).toEqual(issued);
    await recordWeightEvent({ productId: product.id, type: "ISSUED", grams: "0.200", idempotencyKey: randomUUID() });
    const correction = await correctWeightEvent({ productId: product.id, correctsWeightEventId: issued.id, grams: "-0.010", note: "Scale correction", idempotencyKey: randomUUID() });
    await recordWeightEvent({ productId: product.id, type: "FINAL", grams: "0.250", idempotencyKey: randomUUID() });
    const history = await getProductWeightHistory(product.id);
    expect(history.summary.issued).toBe("0.290"); expect(history.summary.materialVariance).toBe("0.040");
    expect(history.events.find(e => e.id === issued.id)?.grams).toBe("0.100");
    await expect(correctWeightEvent({ productId: product.id, correctsWeightEventId: correction.id, grams: "1", note: "Wrong target", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "WEIGHT_CORRECTION_TARGET_INVALID" });
    for (const grams of ["0", "-1", "0.0001", "1e3", "NaN", "10000000"]) await expect(recordWeightEvent({ ...input, grams, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "WEIGHT_INVALID_INPUT" });
  });
  it("enforces permissions and foreign resource isolation for issues and weights", async () => {
    await expect(createIssue({ productId: otherProduct.id, type: "X", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "ISSUE_PRODUCT_NOT_FOUND" });
    await expect(recordWeightEvent({ productId: otherProduct.id, type: "ISSUED", grams: "1", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "WEIGHT_PRODUCT_NOT_FOUND" });
    expect(await listProductIssues(otherProduct.id)).toEqual([]);
    expect((await getProductWeightHistory(otherProduct.id)).events).toEqual([]);
    session(viewer);
    await expect(createIssue({ productId: product.id, type: "X", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getProductWeightHistory(product.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listProductIssues(product.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(correctWeightEvent({ productId: product.id, correctsWeightEventId: randomUUID(), grams: "1", note: "No permission", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("filters products within the current tenant, updates urgency atomically and exports decimal reports", async () => {
    const input = { operation: "update", productId: product.id, expectedVersion: 0, isUrgent: true, targetAt: "2020-01-01T00:00:00.000Z", idempotencyKey: randomUUID() };
    await updateProductOperations(input); await updateProductOperations(input);
    await expect(updateProductOperations({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    const list = await listOperationalProducts({ delayed: "true", urgent: "true" });
    expect(list.products.map(p => p.id)).toEqual([product.id]);
    expect((await getOperationalDashboard()).delayed).toBe(1);
    const csv = await exportProductReport("material", {}, "en");
    expect(csv).toContain('"0.290"'); expect(csv).toContain('"0.040"');
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, action: "report.exported" } })).toBe(1);
    session(foreign); expect((await listOperationalProducts({ q: product.barcode })).total).toBe(0);
    session(viewer); await expect(exportProductReport("material", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listOperationalProducts({ issues: "true" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("audits print/reprint, replays duplicate requests and prevents print permission bypass", async () => {
    const input = { productId: product.id, reprint: false, idempotencyKey: randomUUID() };
    const [first, second] = await Promise.all([prepareBarcodePrint(input), prepareBarcodePrint(input)]);
    expect(second).toEqual(first); expect(first.barcode).toBe(product.barcode);
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, action: "barcode.print_requested" } })).toBe(1);
    await expect(prepareBarcodePrint({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    await prepareBarcodePrint({ ...input, reprint: true, idempotencyKey: randomUUID() });
    await expect(prepareBarcodePrint({ ...input, productId: otherProduct.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    session(viewer); await expect(prepareBarcodePrint(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows only a safe tenant-scoped location transfer with one history event", async () => {
    const location = await prisma.location.create({ data: { organizationId: a.id, code: "SAFE", name: "Safe", type: "SAFE" } });
    const otherLocation = await prisma.location.create({ data: { organizationId: b.id, code: "OTHER", name: "Other", type: "STORAGE" } });
    const input = { operation: "transfer", productId: product.id, expectedVersion: 1, locationId: location.id, reason: "Store", idempotencyKey: randomUUID() };
    await expect(updateProductOperations({ ...input, locationId: otherLocation.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await Promise.all([updateProductOperations(input), updateProductOperations(input)]);
    expect(await prisma.productTransition.count({ where: { organizationId: a.id, productId: product.id, eventType: "MANUAL_TRANSFER" } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).currentLocationId).toBe(location.id);
  });
  it("enforces an atomic shared rate limit under concurrent requests", async () => {
    const key = randomUUID(); const now = new Date("2026-09-06T12:00:00Z");
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeRateLimit("test", key, 3, 60000, a.id, now)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(5);
    await expect(consumeRateLimit("test", key, 3, 60000, b.id, new Date(now.getTime() + 60000))).resolves.toBeUndefined();
  });
});

