import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;

    if (rows[0]?.ok !== 1) {
      throw new Error("PostgreSQL returned an unexpected result");
    }

    process.stdout.write("PostgreSQL connectivity verified.\n");
  } catch (error) {
    process.stderr.write(
      `PostgreSQL connectivity check failed: ${String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
