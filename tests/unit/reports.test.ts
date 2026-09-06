import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "../../src/modules/reports/csv";
import { parseProductFilters } from "../../src/modules/reports/product-filters";
describe("Report boundaries", () => {
  it("neutralizes spreadsheet formulas including leading whitespace", () => {
    for (const value of [
      "=1+1",
      "+cmd",
      "-cmd",
      "@SUM(A1)",
      "  =1",
      "\t+1",
      "\r@1",
    ])
      expect(csvCell(value)).toContain("'");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv([["שלום", "0.300"]])).toBe('\uFEFF"שלום","0.300"\r\n');
  });
  it("rejects invalid filter ranges, duplicate parameters, and malformed tenant references", () => {
    expect(() =>
      parseProductFilters({ from: "2026-09-10", to: "2026-09-01" }),
    ).toThrow();
    expect(() => parseProductFilters({ q: ["one", "two"] })).toThrow();
    expect(() => parseProductFilters({ status: "TRASHED" })).toThrow();
    expect(() => parseProductFilters({ workerId: "foreign-id" })).toThrow();
    expect(() => parseProductFilters({ page: -1 })).toThrow();
  });
});
