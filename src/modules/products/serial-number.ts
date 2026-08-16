import "server-only";

import type { Prisma } from "@prisma/client";

import { ProductCreationError, PRODUCT_ERROR_CODES } from "./product-errors";

export const PRODUCT_SERIAL_MAX_VALUE = 999_999;

type TransactionClient = Prisma.TransactionClient;

export function getUtcSerialYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

export async function allocateProductSerial(
  database: TransactionClient,
  organizationId: string,
  now: Date = new Date(),
): Promise<{ serialNumber: string; year: number; value: number }> {
  const year = getUtcSerialYear(now);

  try {
    const counter = await database.productSerialCounter.upsert({
      where: { organizationId_year: { organizationId, year } },
      create: { organizationId, year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });

    if (counter.lastValue < 1 || counter.lastValue > PRODUCT_SERIAL_MAX_VALUE) {
      throw new ProductCreationError(
        PRODUCT_ERROR_CODES.SERIAL_ALLOCATION_FAILED,
      );
    }

    return {
      year,
      value: counter.lastValue,
      serialNumber: `PRD-${year}-${String(counter.lastValue).padStart(6, "0")}`,
    };
  } catch (error) {
    if (error instanceof ProductCreationError) {
      throw error;
    }

    throw new ProductCreationError(
      PRODUCT_ERROR_CODES.SERIAL_ALLOCATION_FAILED,
    );
  }
}
