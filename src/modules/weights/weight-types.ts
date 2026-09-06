export type WeightEventType =
  | "EXPECTED"
  | "ISSUED"
  | "FINAL"
  | "RETURNED"
  | "APPROVED_LOSS"
  | "CORRECTION";

export type WeightEventDto = {
  id: string;
  productId: string;
  type: WeightEventType;
  grams: string;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  employeeId: string | null;
  productionRoleId: string | null;
  locationId: string | null;
  correctsWeightEventId: string | null;
};

export type WeightSummaryDto = {
  expected: string;
  issued: string;
  final: string;
  returned: string;
  approvedLoss: string;
  correction: string;
  expectedVariance: string;
  materialVariance: string;
};

export type RecordWeightInput = {
  productId: string;
  type: Exclude<WeightEventType, "CORRECTION">;
  grams: string;
  note?: string | null;
  occurredAt?: string | null;
  idempotencyKey: string;
};

export type CorrectWeightInput = {
  productId: string;
  correctsWeightEventId: string;
  grams: string;
  note: string;
  occurredAt?: string | null;
  idempotencyKey: string;
};
