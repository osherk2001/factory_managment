# SECURITY.md

## 1. Security goals

FactoryFlow must protect:

- tenant isolation
- user identity
- factory production data
- Product history
- authorization rules
- audit history
- material and weight records

## 2. Trust boundaries

Browser input is untrusted.

The server is responsible for:

- authentication
- authorization
- validation
- tenant scoping
- business-rule enforcement

## 3. Authentication

Requirements:

- personal accounts
- no shared worker PIN identity
- secure password hashing
- secure session handling
- secure cookies in production
- account disable capability
- administrator-controlled password reset for initial factory onboarding

Never store plaintext passwords.

Phase 4 uses Auth.js Credentials authentication with `User.username` as the
login identifier. Passwords are hashed with Argon2id. The Auth.js session is a
JWT-backed, HttpOnly framework-managed cookie with a 30-day maximum age. The
session contains only safe identity data; current User, Membership, and
Permission state is revalidated from the database before secure operations.

## 4. Authorization

All protected mutations and reads require server-side authorization.

Do not rely on UI restrictions.

Use default deny.

## 5. Tenant isolation

Every tenant-owned query is scoped by Organization.

Cross-tenant access is a critical security defect.

Tests must include deliberate attempts to access another Organization's records.

## 6. Input validation

Validate untrusted input using Zod or equivalent schemas.

Validation includes:

- required fields
- enum values
- string lengths
- UUID format
- decimal bounds
- timestamp validity
- allowed action types

Client validation is UX only.

## 7. Mass assignment

Do not spread raw request objects directly into ORM create/update operations.

Bad:

```text
data: requestBody
```

Required concept:

```text
data: {
  allowedFieldA,
  allowedFieldB
}
```

## 8. Database security

Use:

- foreign keys
- unique constraints
- transactions
- least-privilege database credentials
- parameterized ORM queries
- migration-controlled schema changes

Do not rely only on application checks for critical invariants.

Worker production context is protected by both database and server checks. The
database scopes `WorkerProductionContext` to the same Organization as its
EmployeeProfile and optional ProductionRole. The server revalidates the active
Membership, EmployeeProfile, role assignment, and role activity on every
worker request. Personal Product reads use the trusted EmployeeProfile and
`IN_PROGRESS` status in the tenant-scoped query; browser-supplied worker or
organization identifiers are not accepted.

Changing the persisted working role requires `scans.perform`. A stale role is
never used: it is ignored and the worker must use the remaining valid role or
make a new explicit selection.

`EmployeeProfile` is the per-worker production-context mutex. ProductionRole
selection and state-changing scan actions acquire the same row-level
PostgreSQL lock before revalidating or updating production context. The lock
serializes worker context changes; Product `version` compare-and-set remains
the separate guard for competing Product responsibility mutations.

## 9. Scan security

Barcode values must be unique and non-guessable.

A barcode identifies a Product but does not authorize an action.

Every scan still requires:

- authenticated user
- active Membership
- permission
- tenant validation
- Product state validation

Product creation follows the same server trust boundary. The server requires
`products.create`, ignores client-supplied tenant and Product state fields,
validates optional order/type references in the trusted tenant, and performs
Product, barcode, transition, audit, serial-counter, and idempotency writes in
one transaction. The Product creation idempotency key is scoped to
`(organizationId, userId, key)` and changed-payload reuse is rejected. The
completed operation stores an immutable safe response snapshot; exact replays
validate that JSON with Zod and do not reconstruct it from mutable Product
state.

Product serials use an atomic tenant/year counter. Barcode identities use
cryptographically secure random bytes with bounded uniqueness retries and do
not contain sequential IDs or business data.

Phase 7 treats a scanned value as an untrusted decoded string. It is trimmed
and length-limited before use; every lookup includes the trusted
`organizationId`. The active ProductionRole and its
`EmployeeProductionRole.handlingLocationId` are revalidated, including
production-role and Location activity, inside the receive/takeover transaction
after the EmployeeProfile row lock is acquired. A foreign barcode is reported
as unavailable rather than disclosed.

Product `targetAt` values are accepted by the server only with an explicit ISO
timezone or offset. The browser converts its local `datetime-local` value to a
UTC ISO instant before submission, so the server timezone cannot change the
meaning of the requested target time.

## 10. Concurrency and replay

State-changing requests must support:

- idempotency protection
- transaction boundaries
- concurrency checks
- duplicate request prevention

A retry must not create duplicate ProductTransitions or ProductAssignments.

Receive and takeover reserve an idempotency key scoped to the tenant and
actor, store a validated safe result snapshot, and use Product `version` as a
compare-and-set predicate. The existing PostgreSQL partial unique index on
active ProductAssignments remains a second integrity defense. Same-worker
confirmation and completed-product department classification do not mutate
state in Phase 7. State-changing scans re-resolve the effective active
ProductionRole and role-specific handling Location inside the transaction after
acquiring the EmployeeProfile mutex; the pre-transaction worker context is not
trusted for Product mutation. Product `version` compare-and-set remains the
separate Product-level concurrency guard. A stale takeover version is reported
as `SCAN_CONFLICT` so the worker can scan again.

## 11. Rate limiting

Apply rate limiting where abuse risk exists.

Priority endpoints:

- login
- password reset
- scan mutation
- high-volume search if necessary

Login rate limiting is not implemented in Phase 4 because the approved MVP
does not include Redis or another shared rate-limit service. It remains a
production-readiness requirement and must not be treated as solved by an
in-memory process-local limiter.

## 12. CSRF

Use appropriate CSRF protection based on the final mutation/session model.

Do not assume same-origin UI alone is sufficient.

## 13. Secrets

Secrets belong only in:

- environment variables
- approved secret management systems

Never commit:

- database passwords
- auth secrets
- private keys
- API tokens

Provide `.env.example` with names only, never real values.

Auth.js requires `AUTH_SECRET`. The environment validator requires it in
production, requires any supplied value to be at least 32 characters, and
rejects the documented placeholder value. `.env.example` intentionally leaves
the value blank so copying it cannot create a production-valid shared secret.

## 14. Logging

Do not log:

- passwords
- password hashes
- session tokens
- authentication cookies
- private keys

Security failures should be structured and traceable without exposing secrets.

The authentication path performs Argon2id verification for syntactically valid
credentials even when the username is unknown or the account has no usable
password hash, using a fixed dummy Argon2id hash. Invalid credentials remain a
single generic user-facing error. Auth.js error and warning logs are sanitized;
Auth.js debug metadata is not forwarded to application logs.

The `auth:bootstrap-system-admin` command is an explicit bootstrap operation,
not a development seed operation. It may run in production with a username and
password supplied by an approved secret manager or hidden prompt. It creates a
new platform System Admin or resets an existing System Admin, but refuses to
promote an existing non-System-Admin User and never creates tenant Memberships
or a tenant `SYSTEM_ADMIN` AccessRole.

## 15. Audit vs logs

AuditLog is business/security evidence.

Application logs are operational diagnostics.

They are separate systems and must not be treated interchangeably.

## 16. Error handling

User-facing errors must not expose:

- stack traces
- SQL errors
- infrastructure credentials
- internal file paths
- sensitive identifiers unnecessarily

## 17. Dependency security

Add dependencies deliberately.

Avoid large packages for trivial functionality.

Security upgrades should be reviewed and tested.

## 18. Production checklist

Before production:

- secure cookie settings
- HTTPS only
- production secrets configured
- database backups configured
- restore process tested
- rate limits enabled
- authentication tested
- authorization tests passing
- tenant isolation tests passing
- dependency audit reviewed
- structured logging enabled
