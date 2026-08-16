import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { DEVELOPMENT_ORGANIZATION_SLUG } from "../prisma/seed";
import { hashPassword } from "../src/modules/auth/password-core";
import {
  getOption,
  promptHidden,
  requireDevelopmentEnvironment,
} from "./auth-cli";

async function main() {
  requireDevelopmentEnvironment();

  const username = process.env.AUTH_DEV_USERNAME ?? getOption("--username");
  if (!username) {
    throw new Error(
      "Provide AUTH_DEV_USERNAME or --username=<fixture username>.",
    );
  }

  const password =
    process.env.AUTH_DEV_PASSWORD ?? (await promptHidden("New password: "));
  const passwordHash = await hashPassword(password);
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findFirst({
      where: {
        username,
        memberships: {
          some: { organization: { slug: DEVELOPMENT_ORGANIZATION_SLUG } },
        },
      },
      select: { id: true },
    });

    if (!user) {
      throw new Error("The requested development fixture user was not found.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    process.stdout.write(`Development password updated for ${username}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Development password update failed: ${message}\n`);
  process.exitCode = 1;
});
