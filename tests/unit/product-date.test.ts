import { describe, expect, it } from "vitest";

import { normalizeProductTargetAt } from "../../src/modules/products/product-date";

describe("Product target date normalization", () => {
  it("normalizes an explicit offset to UTC ISO", () => {
    expect(normalizeProductTargetAt("2026-09-01T10:00:00+03:00")).toBe(
      "2026-09-01T07:00:00.000Z",
    );
  });

  it("rejects invalid date values", () => {
    expect(() => normalizeProductTargetAt("not-a-date")).toThrow(RangeError);
  });
});
