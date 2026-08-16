export type AuthenticatedUserContext = {
  userId: string;
  username: string | null;
  isActive: true;
  isSystemAdmin: boolean;
};

export type TenantMembershipOption = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export type TenantContext = TenantMembershipOption & {
  userId: string;
};

export type TenantContextResolution =
  | { kind: "resolved"; context: TenantContext }
  | { kind: "no-membership"; userId: string }
  | { kind: "membership-inactive"; userId: string }
  | {
      kind: "selection-required";
      userId: string;
      memberships: readonly TenantMembershipOption[];
    };

export const MEMBERSHIP_STATUS_ACTIVE = "ACTIVE" as const;

export type PermissionCode = string;
