# ARCHITECTURE.md

## 1. Architecture style

FactoryFlow starts as a modular monolith.

The application is deployed as one product but internally separated into clear domain modules.

Do not introduce microservices unless a measured operational or organizational need appears.

## 2. Initial stack

- TypeScript strict mode
- Next.js App Router
- React
- PostgreSQL
- Prisma
- Zod
- Auth.js
- Tailwind CSS
- shadcn/ui
- React Hook Form where appropriate
- Vitest
- Playwright
- Pino-compatible structured logging
- Docker Compose

## 3. High-level architecture

```text
Mobile/Desktop Browser
        ↓
Next.js UI
        ↓
Server Actions / Route Handlers
        ↓
Application Services
        ↓
Domain Rules
        ↓
Repository / Prisma
        ↓
PostgreSQL
```

UI must not contain the only copy of business rules.

The server is the trust boundary.

## 4. Domain modules

Initial modules:

```text
auth
organizations
memberships
authorization
employees
production-roles
customers
orders
products
workflows
scanning
locations
issues
weights
audit
reports
```

Each module should own its business operations and validation.

## 5. Suggested project structure

```text
src/
  app/
  components/
  modules/
    auth/
    organizations/
    authorization/
    employees/
    products/
    orders/
    workflows/
    scanning/
    locations/
    issues/
    weights/
    audit/
  lib/
    db/
    auth/
    logging/
    validation/
    i18n/
  shared/
    types/
    errors/
    utils/

prisma/
  schema.prisma
  migrations/

docs/
tests/
```

Phase 4 adds the following server-side authentication boundaries:

```text
src/
  auth.ts                 Auth.js Credentials/session configuration
  auth.config.ts          proxy-safe Auth.js configuration
  modules/
    auth/                 password, credential verification, login/logout
    authorization/        User, Membership, Permission, and tenant helpers
  app/
    login/                minimal localized login page
    app/                  protected verification route
proxy.ts                  optimistic authentication redirect only
scripts/
  auth:*                  explicit development password/bootstrap commands
```

`proxy.ts` is an optimistic route filter. It must not be the only
authorization layer. Protected server actions, route handlers, and future
application services must resolve current database-backed authorization
context through the authorization module.

Exact folders may evolve, but domain boundaries should remain clear.

## 6. Request flow

A protected business mutation should generally follow:

```text
request
↓
authentication
↓
organization context
↓
authorization
↓
input validation
↓
domain validation
↓
transaction
↓
database
↓
audit/history
↓
safe response DTO
```

## 7. Business services

Important operations should have explicit application/domain functions.

Examples:

```text
createProduct()
receiveProduct()
finishProductWork()
takeOverProduct()
completeProduct()
returnProductToProcess()
cancelProduct()
restoreProduct()
trashProduct()
reportIssue()
recordWeight()
```

The same business function should be reusable from different UI entry points.

Example:

Both:

- `Finish work` button
- same-worker barcode rescan followed by confirmation

must call the same server-side finish operation.

## 8. Current state and history

The Product table stores current operational state for fast queries.

History tables store immutable truth.

Current:

```text
status
currentWorkerId
currentRoleId
currentLocationId
currentStageId
```

History:

```text
ProductAssignment
ProductTransition
AuditLog
WeightEvent
Issue
```

Do not reconstruct current dashboards by replaying the full event history on every request.

Do not overwrite history when current state changes.

## 9. Multi-tenancy

Every factory is an Organization.

Tenant context is established on the server from authenticated Membership.

Do not trust tenant identifiers supplied by the browser.

Tenant-owned queries must always be scoped by Organization.

## 10. Concurrency

State-changing Product operations must be transaction-safe.

Critical examples:

- receiving Product
- takeover
- finish work
- completion
- return to process
- cancellation
- restore

The architecture must support:

- idempotency
- state revalidation inside transaction
- one active assignment per Product
- row-level or equivalent concurrency protection

## 11. Workflow philosophy

Workflow is configurable and advisory.

It describes the expected path but does not block an otherwise valid receive action solely because the selected ProductionRole differs from the expected next stage.

The system records the actual path taken.

## 12. Mobile-first worker experience

Workers primarily use personal phones.

Worker flows should:

- minimize typing
- minimize taps
- support camera barcode scanning
- provide clear confirmations
- provide clear conflicts and errors
- keep the selected active ProductionRole visible

## 13. Internationalization

All user-facing application strings must use translation resources.

Initial languages:

- Hebrew
- English
- Russian

Default language:

- Hebrew

## 14. External services

Do not add external infrastructure without a current requirement.

Initial MVP does not require:

- Redis
- Kafka
- Kubernetes
- microservices
- event streaming
- AI services

## 15. Deployment direction

Initial local development uses Docker Compose.

Production deployment may use:

- Vercel or equivalent for the Next.js application
- managed PostgreSQL such as Supabase PostgreSQL

Production provider selection must not change domain architecture.

## 16. Architecture rule

Prefer the simplest design that preserves:

- correctness
- tenant isolation
- security
- auditability
- concurrency safety
- maintainability
