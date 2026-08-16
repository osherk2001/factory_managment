import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { bootstrapSystemAdmin } from "../src/modules/auth/system-admin-bootstrap";
import {
  hashPassword,
  passwordSchema,
} from "../src/modules/auth/password-core";
import { getOption, promptHidden } from "./auth-cli";

async function main() {
  const username = (
    process.env.AUTH_BOOTSTRAP_USERNAME ?? getOption("--username")
  )?.trim();
  if (!username) {
    throw new Error(
      "Provide AUTH_BOOTSTRAP_USERNAME or --username=<system admin username>.",
    );
  }

  const password =
    process.env.AUTH_BOOTSTRAP_PASSWORD ??
    (await promptHidden("System Admin password: "));
  if (!passwordSchema.safeParse(password).success) {
    throw new Error(
      "Provide a valid System Admin password of at least 10 characters.",
    );
  }

  const passwordHash = await hashPassword(password);
  const prisma = new PrismaClient();

  try {
    const result = await bootstrapSystemAdmin(prisma, {
      username,
      passwordHash,
    });

    process.stdout.write(
      `System Admin bootstrap ${result.created ? "created" : "updated"} ${result.username ?? result.id}.\n`,
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
