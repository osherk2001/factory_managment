import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/modules/auth/password-core";
import {
  getOption,
  promptHidden,
  requireDevelopmentEnvironment,
} from "./auth-cli";

async function main() {
  requireDevelopmentEnvironment();

  const username =
    process.env.AUTH_BOOTSTRAP_USERNAME ?? getOption("--username");
  if (!username) {
    throw new Error(
      "Provide AUTH_BOOTSTRAP_USERNAME or --username=<system admin username>.",
    );
  }

  const password =
    process.env.AUTH_BOOTSTRAP_PASSWORD ??
    (await promptHidden("System Admin password: "));
  const passwordHash = await hashPassword(password);
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash,
        isActive: true,
        isSystemAdmin: true,
      },
      create: {
        username,
        passwordHash,
        isActive: true,
        isSystemAdmin: true,
      },
      select: { id: true, username: true },
    });

    process.stdout.write(
      `System Admin bootstrap completed for ${user.username ?? user.id}.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`System Admin bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
