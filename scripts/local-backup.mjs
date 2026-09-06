import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("This helper is for the local Docker database only.");
const schema = url.searchParams.get("schema") ?? "public";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Unsupported schema name.");
const database = new PrismaClient();
const suffix = Date.now().toString();
const directory = resolve("backups");
mkdirSync(directory, { recursive: true });
function docker(args, input) {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", ...args], { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("Local database backup/restore command failed: " + (result.stderr?.toString() ?? ""));
  return result.stdout;
}
const restoreName = "factoryflow_restore_" + suffix;
try {
  const backup = await database.$transaction(async transaction => {
    const [snapshot] = await transaction.$queryRaw`SELECT pg_export_snapshot() AS id`;
    const [counts] = await transaction.$queryRaw`SELECT
      (SELECT count(*)::int FROM "Product") AS products,
      (SELECT count(*)::int FROM "ProductAssignment") AS assignments,
      (SELECT count(*)::int FROM "ProductTransition") AS transitions,
      (SELECT count(*)::int FROM "AuditLog") AS audits,
      (SELECT count(*)::int FROM "WeightEvent") AS weights,
      (SELECT count(*)::int FROM "Issue") AS issues`;
    const data = docker(["sh", "-c", 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --schema="$2" --snapshot="$1"', "sh", snapshot.id, schema]);
    return { data, counts };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
  const filename = resolve(directory, "factoryflow-" + suffix + ".dump");
  writeFileSync(filename, backup.data, { mode: 0o600 });
  const manifest = { createdAt: new Date().toISOString(), schema, sha256: createHash("sha256").update(backup.data).digest("hex"), counts: backup.counts };
  writeFileSync(filename + ".json", JSON.stringify(manifest, null, 2), { mode: 0o600 });
  process.stdout.write("Local backup created: " + filename + "\n");
  if (process.argv.includes("--verify-restore")) {
    docker(["sh", "-c", 'createdb -U "$POSTGRES_USER" "$1"', "sh", restoreName]);
    docker(["sh", "-c", 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error', "sh", restoreName], backup.data);
    const restoredUrl = new URL(url); restoredUrl.pathname = "/" + restoreName;
    const restored = new PrismaClient({ datasourceUrl: restoredUrl.toString() });
    try {
      const [counts] = await restored.$queryRaw`SELECT
        (SELECT count(*)::int FROM "Product") AS products,
        (SELECT count(*)::int FROM "ProductAssignment") AS assignments,
        (SELECT count(*)::int FROM "ProductTransition") AS transitions,
        (SELECT count(*)::int FROM "AuditLog") AS audits,
        (SELECT count(*)::int FROM "WeightEvent") AS weights,
        (SELECT count(*)::int FROM "Issue") AS issues`;
      if (JSON.stringify(counts) !== JSON.stringify(backup.counts)) throw new Error("Restore counts differ from the consistent backup snapshot.");
      process.stdout.write("Restore verified in separate database " + restoreName + ": " + JSON.stringify(counts) + "\n");
    } finally { await restored.$disconnect(); }
  }
} finally { await database.$disconnect(); }

