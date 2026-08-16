export type CreateProductInput = {
  productionOrderId?: string | null;
  productTypeId?: string | null;
  isUrgent?: boolean;
  targetAt?: string | null;
  idempotencyKey: string;
};

export type CreatedProductDto = {
  id: string;
  serialNumber: string;
  status: "CREATED";
  barcode: string;
  productionOrderId: string | null;
  productTypeId: string | null;
  isUrgent: boolean;
  targetAt: string | null;
  createdAt: string;
};
