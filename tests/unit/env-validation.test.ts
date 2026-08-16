import { describe, expect, it } from "vitest";

import {
  AUTH_SECRET_PLACEHOLDER,
  validateEnvironment,
} from "../../src/lib/env-validation";

const baseEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://localhost/factoryflow",
  NODE_ENV: "test",
};

describe("environment validation", () => {
  it("allows an empty AUTH_SECRET outside production", () => {
    expect(
      validateEnvironment({ ...baseEnvironment, AUTH_SECRET: "" }),
    ).toMatchObject({ NODE_ENV: "test", AUTH_SECRET: undefined });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["short", "too-short"],
    ["documented placeholder", AUTH_SECRET_PLACEHOLDER],
  ])("rejects %s AUTH_SECRET in production", (_label, authSecret) => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
        AUTH_SECRET: authSecret,
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it("accepts a non-placeholder production AUTH_SECRET of sufficient length", () => {
    expect(
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
        AUTH_SECRET: "test-only-auth-secret-for-unit-tests-123456",
      }).AUTH_SECRET,
    ).toBe("test-only-auth-secret-for-unit-tests-123456");
  });
});
