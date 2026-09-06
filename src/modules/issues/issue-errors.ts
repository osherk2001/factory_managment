import { ApplicationError } from "@/shared/errors";

export const ISSUE_ERROR_CODES = {
  INVALID_INPUT: "ISSUE_INVALID_INPUT",
  NOT_FOUND: "ISSUE_NOT_FOUND",
  PRODUCT_NOT_FOUND: "ISSUE_PRODUCT_NOT_FOUND",
  INVALID_STATE: "ISSUE_INVALID_STATE",
  IDEMPOTENCY_CONFLICT: "ISSUE_IDEMPOTENCY_CONFLICT",
  FAILED: "ISSUE_FAILED",
} as const;

export class IssueError extends ApplicationError {
  constructor(code: string) {
    super(code, code);
    this.name = "IssueError";
  }
}

export function isIssueError(error: unknown): error is IssueError {
  return error instanceof IssueError;
}
