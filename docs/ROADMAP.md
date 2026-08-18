# ROADMAP.md

## Phase 0 — Product and architecture definition

Status: complete enough to begin implementation.

Deliverables:

- AGENTS.md
- PRD.md
- DOMAIN.md
- DECISIONS.md
- ARCHITECTURE.md
- DATABASE.md
- AUTHORIZATION.md
- SECURITY.md
- WORKFLOW_ENGINE.md
- BARCODE_SCANNING.md

## Phase 1 — Project foundation

Goal:

Create a clean, runnable development foundation without implementing the full FactoryFlow domain.

Implement:

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui foundation
- ESLint and formatting
- environment validation
- Docker Compose
- PostgreSQL local service
- Prisma setup and database connection
- structured logging foundation
- i18n foundation for Hebrew, English, and Russian
- Vitest setup
- Playwright setup
- health endpoint
- initial modular folder structure
- `.env.example`
- development README instructions

Do not yet implement:

- full Prisma domain schema
- authentication flows
- role/permission enforcement
- Product lifecycle logic
- barcode scanning logic
- workflow engine
- dashboards
- reports

Exit criteria:

- application starts successfully
- PostgreSQL starts through Docker Compose
- Prisma can connect to PostgreSQL
- health endpoint succeeds
- lint succeeds
- typecheck succeeds
- unit test command succeeds
- Playwright smoke test succeeds
- i18n foundation renders at least the default Hebrew locale
- no business rules are invented

## Phase 2 — Core database model

Implement the first Prisma schema based on DATABASE.md.

Focus on:

- Organization
- User
- Membership
- AccessRole
- Permission
- AccessRolePermission
- MembershipAccessRole
- EmployeeProfile
- ProductionRole
- EmployeeProductionRole
- Department
- Location
- Customer
- ProductionOrder
- ProductType
- Product
- Barcode
- ProductAssignment
- ProductTransition
- AuditLog

Then add workflow, issue, and weight tables as documented.

Requirements:

- migrations
- foreign keys
- unique constraints
- tenant-scoped uniqueness
- active-assignment database protection
- basic database integration tests

## Phase 3 — Seed and development fixtures

Create secure, deterministic development seed data.

Include:

- one development Organization
- System Admin fixture where appropriate
- Factory Admin
- worker accounts
- sample AccessRoles and Permissions
- sample ProductionRoles
- sample Departments and Locations

Never seed production credentials.

## Phase 4 — Authentication and authorization

Implement:

- login
- sessions
- Membership resolution
- organization context
- AccessRole/Permission resolution
- server-side authorization helpers
- tenant isolation
- authorization integration tests

Do not rely on UI hiding for security.

## Phase 5 — Product creation

Implement:

- Product creation
- serial-number generation
- barcode-value generation
- `CREATED` initial state
- Product read view
- barcode print foundation
- audit events

## Phase 6 — Worker production context

Status: Implemented

Implement:

- worker home screen
- available ProductionRoles
- active ProductionRole selection
- persistence of selected working context
- worker personal Product list

The implementation provides `/app/worker`, tenant-scoped worker resolution,
database-backed `WorkerProductionContext`, Hebrew-default i18n, and automated
integration/E2E coverage. It does not perform Product mutations, barcode
scanning, location inference, or workflow execution.

## Phase 7 — Barcode scanning and responsibility

Status: Implemented

Implement documented scan flows:

- CREATED receive
- READY_FOR_HANDOFF receive
- same-worker rescan confirmation
- takeover from another worker
- completed Product same-department handling
- completed Product cross-department handling

Requirements:

- transaction safety
- idempotency
- concurrency protection
- one active assignment invariant
- integration tests

Phase 7 accepts decoded barcode strings through `/app/worker/scan` and
implements tenant-scoped CREATED/READY_FOR_HANDOFF receive, same-worker
confirmation, explicit takeover, terminal-state blocking, and read-only
completed-department classification. Receive and takeover use idempotency,
Product version compare-and-set, the existing one-active-assignment partial
unique index, and append-only assignment/transition history. Camera capture,
finish, completion, return-to-process, cancellation, trash, and workflow
execution remain later phases.

## Phase 8 — Finish, completion, cancel, restore, trash

Implement:

- Finish work
- READY_FOR_HANDOFF
- explicit Product completion
- return to process
- cancellation
- restoration
- logical trash

Preserve append-only history.

Status: Implemented

Phase 8 implements Finish work, explicit completion, explicit
return-to-process, cancellation, restoration, and logical trash with
tenant-scoped authorization, Product version compare-and-set, idempotency,
safe lifecycle DTOs, append-only transition/audit history, assignment
integrity, and concurrency tests. The worker UI supports personal Finish work
and explicit scan confirmations; the management route exposes contextual
lifecycle controls. No workflow progression, physical deletion, undo, or
Phase 9 behavior is included.

## Phase 9 — Workflow engine

Status: Implemented / pending final hardening approval

Implement:

- WorkflowTemplate
- WorkflowSnapshot
- stages
- ProductionRole mapping
- actual-path tracking
- forward and backward movement
- rework

Workflow remains advisory rather than rigidly blocking valid production scans.

Phase 9 provides tenant-scoped immutable WorkflowTemplate versions,
activation/deactivation, transactional Product snapshots, active-role stage
resolution for receive/takeover/return-to-process, ambiguous-stage selection,
movement/deviation/rework metadata, append-only actual-path visibility,
management/Product/worker UI, deterministic development fixtures, and
integration/E2E coverage. Existing Products without workflows remain
supported. Final hardening adds a PostgreSQL partial unique index for one active
version per Organization and workflow name, safe activation/version
concurrency handling, stale-stage confirmation protection, and deterministic
workflow concurrency and ambiguous-selection tests. Phase 10 issues and
weights are not included.

## Phase 10 — Issues and weights

Implement:

- issue lifecycle
- weight events
- corrections
- material calculations
- history

## Phase 11 — Manager operations and dashboards

Implement:

- Product inspection
- Product search
- filters
- active issues
- delayed/urgent views
- responsibility and location visibility
- operational dashboard

## Phase 12 — Reporting

Implement operational and material reports.

## Phase 13 — Production readiness

Complete:

- rate limiting
- security review
- backup strategy
- restore test
- error monitoring
- structured production logs
- performance review
- dependency review
- tenant isolation review
- end-to-end critical-flow testing

## Working rule

Only implement the current Phase.

Do not silently begin future Phases.

At the end of each Phase:

1. run lint
2. run typecheck
3. run tests
4. summarize files changed
5. summarize architectural decisions
6. identify unresolved issues
7. stop and wait for the next explicit Phase instruction
