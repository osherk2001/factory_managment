import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/env");
}
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { logger } = await import("./lib/logging/logger");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  logger.error(
    {
      event: "request_failed",
      digest,
      errorName: error instanceof Error ? error.name : "Unknown",
      method: request.method,
      route: context.routePath,
    },
    "Unhandled request error",
  );
};
