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

## 9. Scan security

Barcode values must be unique and non-guessable.

A barcode identifies a Product but does not authorize an action.

Every scan still requires:

- authenticated user
- active Membership
- permission
- tenant validation
- Product state validation

## 10. Concurrency and replay

State-changing requests must support:

- idempotency protection
- transaction boundaries
- concurrency checks
- duplicate request prevention

A retry must not create duplicate ProductTransitions or ProductAssignments.

## 11. Rate limiting

Apply rate limiting where abuse risk exists.

Priority endpoints:

- login
- password reset
- scan mutation
- high-volume search if necessary

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

## 14. Logging

Do not log:

- passwords
- password hashes
- session tokens
- authentication cookies
- private keys

Security failures should be structured and traceable without exposing secrets.

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
