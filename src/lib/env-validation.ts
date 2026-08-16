import { z } from "zod";

export const AUTH_SECRET_PLACEHOLDER =
  "replace-with-at-least-32-random-characters";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AUTH_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  ),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse({
    NODE_ENV: input.NODE_ENV,
    DATABASE_URL: input.DATABASE_URL,
    LOG_LEVEL: input.LOG_LEVEL,
    PORT: input.PORT,
    AUTH_SECRET: input.AUTH_SECRET,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .join(", ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  if (result.data.NODE_ENV === "production") {
    if (!result.data.AUTH_SECRET) {
      throw new Error(
        "Invalid environment configuration: AUTH_SECRET is required in production",
      );
    }

    if (result.data.AUTH_SECRET === AUTH_SECRET_PLACEHOLDER) {
      throw new Error(
        "Invalid environment configuration: AUTH_SECRET must not use the documented placeholder in production",
      );
    }
  }

  return result.data;
}
