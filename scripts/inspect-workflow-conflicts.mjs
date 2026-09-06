import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const database = new PrismaClient();
try {
  const conflicts = await database.workflowTemplate.groupBy({
    by: ["organizationId", "name"],
    where: { isActive: true },
    having: { id: { _count: { gt: 1 } } },
    _count: { id: true },
  });
  const result = [];
  for (const conflict of conflicts)
    result.push(
      await database.workflowTemplate.findMany({
        where: {
          organizationId: conflict.organizationId,
          name: conflict.name,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          version: true,
          organization: { select: { name: true, slug: true } },
          _count: { select: { snapshots: true } },
        },
        orderBy: { version: "asc" },
      }),
    );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally {
  await database.$disconnect();
}
