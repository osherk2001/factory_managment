import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "secret",
      "authorization",
      "cookie",
      "credentials",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  base: { service: "factoryflow" },
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
