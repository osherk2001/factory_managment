import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Local preview only.");
url.searchParams.set("schema", "factoryflow_verification");
const database = new PrismaClient({ datasourceUrl: url.toString() });
try {
  const path = ".env.preview.local";
  const config = existsSync(path)
    ? parse(readFileSync(path))
    : {
        PREVIEW_USERNAME: "factoryflow-preview-admin",
        PREVIEW_PASSWORD: randomBytes(24).toString("base64url"),
        AUTH_SECRET: randomBytes(48).toString("base64url"),
      };
  const role = await database.accessRole.findFirstOrThrow({
    where: { code: "FACTORY_ADMIN", organization: { slug: "factoryflow-dev" } },
    select: { id: true, organizationId: true },
  });
  const passwordHash = await argon2.hash(config.PREVIEW_PASSWORD, {
    type: argon2.argon2id,
  });
  await database.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { username: config.PREVIEW_USERNAME },
      create: { username: config.PREVIEW_USERNAME, passwordHash },
      update: {},
      select: { id: true },
    });
    const member = await tx.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: role.organizationId,
          userId: user.id,
        },
      },
      create: {
        organizationId: role.organizationId,
        userId: user.id,
        status: "ACTIVE",
      },
      update: {},
      select: { id: true },
    });
    await tx.membershipAccessRole.upsert({
      where: {
        membershipId_accessRoleId: {
          membershipId: member.id,
          accessRoleId: role.id,
        },
      },
      create: {
        organizationId: role.organizationId,
        membershipId: member.id,
        accessRoleId: role.id,
      },
      update: {},
    });
  });
  if (!existsSync(path))
    writeFileSync(
      path,
      Object.entries(config)
        .map(([key, value]) => key + "=" + value)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
  process.stdout.write(
    "Separate preview administrator prepared. Credentials are in the ignored .env.preview.local file.\n",
  );
} finally {
  await database.$disconnect();
}
