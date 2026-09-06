import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const url = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  (url.searchParams.get("schema") ?? "public") !== "public"
)
  throw new Error(
    "This repair is limited to the inspected local public schema.",
  );
const database = new PrismaClient();
function prisma(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) throw new Error("Prisma migration command failed.");
}
try {
  const [history] =
    await database.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS name`;
  if (!history.name) {
    // These definitions were compared against a clean migration-chain restore.
    // Creating the constraints validates existing data and rolls back on failure.
    await database.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenant_actor_context_check" CHECK (("organizationId" IS NULL AND "actorMembershipId" IS NULL) OR ("organizationId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "actorMembershipId" IS NOT NULL))',
      );
      await transaction.$executeRawUnsafe(
        readFileSync(
          "prisma/migrations/20260816160000_add_issue_resolver_context_check/migration.sql",
          "utf8",
        ),
      );
      await transaction.$executeRawUnsafe(
        'CREATE UNIQUE INDEX "product_one_active_assignment" ON "ProductAssignment" ("productId") WHERE "endedAt" IS NULL',
      );
      await transaction.$executeRawUnsafe(
        readFileSync(
          "prisma/migrations/20260818090000_enforce_one_active_workflow_version/migration.sql",
          "utf8",
        ),
      );
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "WorkerProductionContext" RENAME CONSTRAINT "WorkerProductionContext_organizationId_activeProductionRol_fkey" TO "WorkerProductionContext_organizationId_activeProductionRoleId_f"',
      );
      await transaction.$executeRawUnsafe(
        'ALTER INDEX "WorkerProductionContext_organizationId_activeProductionRole_idx" RENAME TO "WorkerProductionContext_organizationId_activeProductionRoleId_i"',
      );
    });
    const migrations = readdirSync("prisma/migrations")
      .filter((name) => /^202608/.test(name))
      .sort();
    for (const migration of migrations)
      prisma(["migrate", "resolve", "--applied", migration]);
  }
  prisma(["migrate", "deploy"]);
  const path = ".env";
  let content = readFileSync(path, "utf8");
  if (!process.env.AUTH_SECRET) {
    content = content.replace(/^AUTH_SECRET=.*$/m, "");
    writeFileSync(
      path,
      content.trimEnd() +
        "\nAUTH_SECRET=" +
        randomBytes(48).toString("base64url") +
        "\n",
    );
    process.stdout.write(
      "Generated a local authentication secret in the ignored .env file.\n",
    );
  }
} finally {
  await database.$disconnect();
}
