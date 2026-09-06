import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.set("schema", "factoryflow_verification");
const commands = {
  build: ["node_modules/next/dist/bin/next", "build"],
  backup: ["scripts/local-backup.mjs"],
  migrate: ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  test: ["node_modules/vitest/vitest.mjs", "run"],
  e2e: ["node_modules/@playwright/test/cli.js", "test"],
  seed: ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
  dev: [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
};
const command = commands[process.argv[2]];
if (!command) throw new Error("Expected migrate, test, e2e, seed, or dev");
const result = spawnSync(
  process.execPath,
  [...command, ...process.argv.slice(3)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_OUTPUT_DIR: process.argv[2] === "dev" ? ".next-preview" : ".next",
      AUTH_SECRET:
        process.env.AUTH_SECRET || randomBytes(48).toString("base64url"),
      DATABASE_URL: databaseUrl.toString(),
      SEED_ENV: "development",
      PLAYWRIGHT_PORT: "3100",
    },
  },
);
process.exit(result.status ?? 1);
