import type { PrismaClient } from "@prisma/client";

type BootstrapDatabase = Pick<PrismaClient, "user">;

export type SystemAdminBootstrapInput = {
  username: string;
  passwordHash: string;
};

export type SystemAdminBootstrapResult = {
  id: string;
  username: string | null;
  created: boolean;
};

export async function bootstrapSystemAdmin(
  database: BootstrapDatabase,
  input: SystemAdminBootstrapInput,
): Promise<SystemAdminBootstrapResult> {
  const existingUser = await database.user.findUnique({
    where: { username: input.username },
    select: { id: true, username: true, isSystemAdmin: true },
  });

  if (existingUser && !existingUser.isSystemAdmin) {
    throw new Error(
      "The requested username belongs to an existing non-System-Admin User; refusing promotion.",
    );
  }

  if (existingUser) {
    const user = await database.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: input.passwordHash,
        isActive: true,
        isSystemAdmin: true,
      },
      select: { id: true, username: true },
    });

    return { ...user, created: false };
  }

  const user = await database.user.create({
    data: {
      username: input.username,
      passwordHash: input.passwordHash,
      isActive: true,
      isSystemAdmin: true,
    },
    select: { id: true, username: true },
  });

  return { ...user, created: true };
}
