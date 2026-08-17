import { notFound, redirect } from "next/navigation";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { isFactoryFlowAuthError } from "@/modules/auth/auth-errors";
import { getWorkerHomeData } from "@/modules/worker-context/server";
import {
  isWorkerContextError,
  WORKER_CONTEXT_ERROR_CODES,
} from "@/modules/worker-context";
import type { WorkerHomeData } from "@/modules/worker-context";

import { WorkerHome } from "@/modules/worker-context/worker-home";

const messages = getMessages(defaultLocale);

export default async function WorkerPage() {
  let workerData: WorkerHomeData | undefined;
  let workerUnavailableMessage: string | undefined;

  try {
    workerData = await getWorkerHomeData();
  } catch (error) {
    if (isFactoryFlowAuthError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      notFound();
    }

    if (isWorkerContextError(error)) {
      if (error.code === WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_INACTIVE) {
        workerUnavailableMessage = messages.worker.employeeInactive;
      }

      if (error.code === WORKER_CONTEXT_ERROR_CODES.EMPLOYEE_PROFILE_REQUIRED) {
        workerUnavailableMessage = messages.worker.employeeProfileRequired;
      }
    }

    if (!workerUnavailableMessage) {
      notFound();
    }
  }

  if (workerUnavailableMessage) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
        <section className="mx-auto w-full max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{messages.worker.title}</h1>
          <p className="mt-3" data-testid="worker-unavailable">
            {workerUnavailableMessage}
          </p>
        </section>
      </main>
    );
  }

  if (!workerData) {
    notFound();
  }

  return <WorkerHome data={workerData} />;
}
