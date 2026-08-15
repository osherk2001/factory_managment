import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const result = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  PORT: process.env.PORT,
});

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => issue.path.join(".") || "environment")
    .join(", ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = result.data;
