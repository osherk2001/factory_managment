import "server-only";

export const AUTH_ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  USER_INACTIVE: "USER_INACTIVE",
  TENANT_CONTEXT_REQUIRED: "TENANT_CONTEXT_REQUIRED",
  ORGANIZATION_SELECTION_REQUIRED: "ORGANIZATION_SELECTION_REQUIRED",
  MEMBERSHIP_INACTIVE: "MEMBERSHIP_INACTIVE",
  FORBIDDEN: "FORBIDDEN",
  SYSTEM_ADMIN_REQUIRED: "SYSTEM_ADMIN_REQUIRED",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

const DEFAULT_MESSAGES: Record<AuthErrorCode, string> = {
  UNAUTHENTICATED: "Authentication is required",
  USER_INACTIVE: "The user account is inactive",
  TENANT_CONTEXT_REQUIRED: "An active organization membership is required",
  ORGANIZATION_SELECTION_REQUIRED: "An organization selection is required",
  MEMBERSHIP_INACTIVE: "The organization membership is inactive",
  FORBIDDEN: "The requested operation is not permitted",
  SYSTEM_ADMIN_REQUIRED: "System Admin authorization is required",
};

export class FactoryFlowAuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message = DEFAULT_MESSAGES[code]) {
    super(message);
    this.name = "FactoryFlowAuthError";
    this.code = code;
  }
}

export function isFactoryFlowAuthError(
  error: unknown,
): error is FactoryFlowAuthError {
  return error instanceof FactoryFlowAuthError;
}
