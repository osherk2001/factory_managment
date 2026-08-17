export const WORKER_CONTEXT_ERROR_CODES = {
  EMPLOYEE_PROFILE_REQUIRED: "EMPLOYEE_PROFILE_REQUIRED",
  EMPLOYEE_INACTIVE: "EMPLOYEE_INACTIVE",
  NO_PRODUCTION_ROLES: "NO_PRODUCTION_ROLES",
  ACTIVE_PRODUCTION_ROLE_REQUIRED: "ACTIVE_PRODUCTION_ROLE_REQUIRED",
  PRODUCTION_ROLE_NOT_AVAILABLE: "PRODUCTION_ROLE_NOT_AVAILABLE",
  PRODUCTION_ROLE_NOT_ASSIGNED: "PRODUCTION_ROLE_NOT_ASSIGNED",
} as const;

export type WorkerContextErrorCode =
  (typeof WORKER_CONTEXT_ERROR_CODES)[keyof typeof WORKER_CONTEXT_ERROR_CODES];

const DEFAULT_MESSAGES: Record<WorkerContextErrorCode, string> = {
  EMPLOYEE_PROFILE_REQUIRED: "An employee profile is required",
  EMPLOYEE_INACTIVE: "The employee profile is inactive",
  NO_PRODUCTION_ROLES: "No production role is assigned",
  ACTIVE_PRODUCTION_ROLE_REQUIRED: "An active production role is required",
  PRODUCTION_ROLE_NOT_AVAILABLE: "The production role is not available",
  PRODUCTION_ROLE_NOT_ASSIGNED: "The production role is not assigned",
};

export class WorkerContextError extends Error {
  readonly code: WorkerContextErrorCode;

  constructor(code: WorkerContextErrorCode, message = DEFAULT_MESSAGES[code]) {
    super(message);
    this.name = "WorkerContextError";
    this.code = code;
  }
}

export function isWorkerContextError(
  error: unknown,
): error is WorkerContextError {
  return error instanceof WorkerContextError;
}
