import { NextRequest, NextResponse } from "next/server";
import { exportProductReport } from "@/modules/reports/report.service";
import { cleanSearchParams } from "@/modules/reports/product-filters";
import { ApplicationError } from "@/shared/errors";
import { defaultLocale, getMessages } from "@/lib/i18n";
import { logger } from "@/lib/logging/logger";
export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams);
  const m = getMessages(defaultLocale).operations;
  try {
    if (query.kind !== "operational" && query.kind !== "material")
      throw new ApplicationError("INVALID_INPUT", "Invalid report");
    const csv = await exportProductReport(query.kind, cleanSearchParams(query));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="factoryflow-${query.kind}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof ApplicationError ? error.code : "UNEXPECTED";
    if (code === "UNEXPECTED")
      logger.error({ event: "report_export_failed" }, "Report export failed");
    return NextResponse.json(
      {
        error:
          code === "REPORT_TOO_LARGE"
            ? m.reportTooLarge
            : (m.errors[code as keyof typeof m.errors] ?? m.failed),
      },
      {
        status:
          code === "UNAUTHENTICATED"
            ? 401
            : code === "FORBIDDEN"
              ? 403
              : code === "UNEXPECTED"
                ? 500
                : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
