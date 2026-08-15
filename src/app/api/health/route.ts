import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function GET() {
  const requestId = crypto.randomUUID();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      database: "ok",
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, requestId }, "Health check failed");

    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
