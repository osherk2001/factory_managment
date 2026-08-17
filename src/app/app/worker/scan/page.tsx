import { notFound, redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { getWorkerScanPageData } from "@/modules/scanning/server";
import {
  isWorkerScanError,
  SCAN_ERROR_CODES,
} from "@/modules/scanning/scan-errors";
import {
  isWorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "@/modules/worker-context";
import type { ActiveProductionHandlingContextDto } from "@/modules/scanning/scan-types";

import { WorkerScanPage } from "@/modules/scanning/worker-scan";

const messages = getMessages(defaultLocale);

export default async function WorkerScanRoute() {
  let scanData: ActiveProductionHandlingContextDto | undefined;

  try {
    scanData = await getWorkerScanPageData();
  } catch (error) {
    if (isFactoryFlowAuthError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      notFound();
    }

    if (isWorkerScanError(error)) {
      if (
        error.code !== SCAN_ERROR_CODES.WORK_LOCATION_REQUIRED &&
        error.code !== SCAN_ERROR_CODES.WORK_LOCATION_INACTIVE
      ) {
        notFound();
      }
    }

    if (isWorkerContextError(error)) {
      if (
        error.code !== WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED &&
        error.code !== WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_INACTIVE &&
        error.code !== WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES &&
        error.code !==
          WORKER_CONTEXT_ERROR_CODES.ACTIVE_PRODUCTION_ROLE_REQUIRED
      ) {
        notFound();
      }
    }

    let message: string = messages.worker.scanUnavailable;
    if (isWorkerScanError(error)) {
      if (error.code === SCAN_ERROR_CODES.WORK_LOCATION_REQUIRED) {
        message = messages.worker.workLocationRequired;
      }
      if (error.code === SCAN_ERROR_CODES.WORK_LOCATION_INACTIVE) {
        message = messages.worker.workLocationInactive;
      }
    }
    if (isWorkerContextError(error)) {
      if (error.code === WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED) {
        message = messages.worker.employeeProfileRequired;
      }
      if (error.code === WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_INACTIVE) {
        message = messages.worker.employeeInactive;
      }
      if (error.code === WORKER_CONTEXT_ERROR_CODES.NO_PRODUCTION_ROLES) {
        message = messages.worker.noProductionRoleAssigned;
      }
      if (
        error.code ===
        WORKER_CONTEXT_ERROR_CODES.ACTIVE_PRODUCTION_ROLE_REQUIRED
      ) {
        message = messages.worker.roleSelectionRequired;
      }
    }

    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
        <section className="mx-auto w-full max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">
            {messages.worker.scanTitle}
          </h1>
          <p className="mt-3" data-testid="scan-unavailable">
            {message}
          </p>
        </section>
      </main>
    );
  }

  if (!scanData) {
    notFound();
  }

  return <WorkerScanPage data={scanData} />;
}
