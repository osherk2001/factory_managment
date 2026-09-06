import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PERMISSION_CODES } from "../prisma/seed";

// Parallel suites share this global catalog. Initialize it before any upsert
// so Prisma's client-side empty-update upserts cannot race on a fresh database.
export default async function setup() {
  const database = new PrismaClient();
  try {
    await database.permission.createMany({ data: PERMISSION_CODES.map(code => ({ code })), skipDuplicates: true });
  } finally { await database.$disconnect(); }
}
