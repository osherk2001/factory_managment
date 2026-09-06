export type IssueStatus = "OPEN" | "RESOLVED";

export type IssueActorDto = {
  id: string;
  username: string | null;
};

export type IssueDto = {
  id: string;
  productId: string;
  type: string;
  description: string | null;
  status: IssueStatus;
  reportedBy: IssueActorDto;
  resolvedBy: IssueActorDto | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
};

export type CreateIssueInput = {
  productId: string;
  type: string;
  description?: string | null;
  idempotencyKey: string;
};

export type ResolveIssueInput = {
  issueId: string;
  resolution?: string | null;
  idempotencyKey: string;
};
