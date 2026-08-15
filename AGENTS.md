# AGENTS.md

## 1. Project identity

Project name: FactoryFlow.
FactoryFlow is a multi-tenant Manufacturing Execution System for small and medium-sized factories.
The first customer is a jewelry factory, but the product must remain factory-agnostic.
The core promise is: at any moment, an authorized user can know where a product is, who is responsible for it, what state it is in, and what happened to it.

## 2. Working principles

Build the system incrementally. Do not attempt to implement the entire product in one change.
Prefer simple, explicit architecture over clever abstractions.
Do not introduce infrastructure, libraries, patterns, or services without a concrete current need.
Do not change an established architectural or domain decision silently.
When a decision changes, update the relevant documentation in the same change.
Do not invent missing business rules. Mark them as unresolved and keep the implementation safe.
Preserve existing working behavior unless the requested change explicitly replaces it.
Keep changes small, reviewable, and scoped to the current task.

## 3. Technology baseline

Use TypeScript with strict type checking.
Use Next.js with the App Router.
Use React for the user interface.
Use PostgreSQL as the primary relational database.
Use Prisma for database access and migrations.
Use Zod for validation at trust boundaries.
Use Auth.js for authentication unless the architecture documentation explicitly replaces it.
Use Tailwind CSS and shadcn/ui for the interface.
Use React Hook Form for complex forms when appropriate.
Use Vitest for unit and integration tests.
Use Playwright for critical end-to-end flows.
Use Pino or an equivalent structured logger for application logs.
Use Docker Compose for the local development environment.
Do not change the package manager, framework, ORM, database, or authentication system without an explicit architectural decision.

## 4. Product architecture

Start as a modular monolith.
Organize business logic by domain modules, not by technical layer alone.
Expected modules include: auth, organizations, users, customers, orders, products, workflows, scanning, locations, issues, weights, audit, and reports.
Keep UI, transport, business rules, and persistence responsibilities separated.
Business rules must not live only in React components.
Database models must not be exposed directly as public API contracts.
Prefer explicit application services or domain functions for important business operations.
Do not introduce microservices until there is a measured operational or organizational reason.

## 5. Multi-tenant rules

Every factory is an Organization tenant.
Tenant-owned records must be associated with an organization identifier.
Every tenant-scoped read and write must enforce the current organization context on the server.
Never trust an organizationId received from the browser as authorization.
A user may access tenant data only through a valid membership and the required permission.
Cross-tenant data access is a critical security defect.
Prefer database constraints that include organization scope where uniqueness is tenant-specific.
Tests must include attempts to access another organization's data.

## 6. Authentication and authorization

Authentication answers who the user is.
Authorization answers what the authenticated user is allowed to do.
Enforce authorization on the server for every protected operation.
Do not rely on hidden buttons or client-side checks for security.
Prefer permission checks over hard-coded role-name checks in business logic.
Roles are collections of permissions and may evolve by organization.
Use least privilege by default.
System-level actions and tenant-level actions must remain clearly separated.
Password reset, user management, role management, and permission management must be audited.

## 7. Product domain rules

A Product is an individually tracked physical production unit.
Creating a Product persists it to the database and generates its internal identifiers and barcode value.
A newly created Product starts with status CREATED.
A Product in CREATED is already scannable.
Do not add a separate production activation gate unless the product specification changes.
CREATED means the product exists but no worker has started handling it yet.
The first valid worker scan may transition the Product from CREATED to IN_PROGRESS.
A successful receive scan must record the responsible worker, active role, current location, timestamp, and history event.
Product status, current worker, current role, and current location are separate concepts and must not be collapsed into one field.
A Product may move between workers and roles many times during its lifetime.
Historical movement and responsibility records are append-only.
Do not overwrite history to correct a mistake. Record a correcting event.
Manual status changes require explicit permission and an audit record.
Do not invent new status transitions. Implement only transitions defined in the product specification or workflow documentation.

## 8. Barcode and scanning rules

Each Product has a unique barcode value.
The barcode value must be non-guessable and must not expose sensitive business data.
Do not use a sequential database ID as the barcode payload.
Barcode symbology is an implementation choice and must remain replaceable until a printer and scanner standard is approved.
Printing and reprinting barcodes are permission-controlled actions.
Barcode print and reprint actions must be auditable.
A scan request is a state-changing business operation, not a simple lookup.
Every scan mutation must be validated, authorized, atomic, idempotent, and concurrency-safe.
Use a database transaction for scan operations that update product state, assignment, location, and history.
Do not use an unprotected read-then-write sequence for scan state transitions.
Repeated delivery of the same scan request must not create duplicate transitions.
Concurrent scans must never leave a Product assigned to two workers or in contradictory states.
Return a clear domain error when a scan is no longer valid because the Product state changed.

## 9. Workflow rules

FactoryFlow must support configurable production workflows.
Do not hard-code jewelry-specific production stages into core application logic.
A workflow template defines the reusable process configuration.
A workflow snapshot preserves the process assigned to a specific Product or production instance at the relevant point in time.
Changing a workflow template must not silently rewrite historical product behavior.
Rework and backward movement must be represented explicitly rather than by deleting prior transitions.
Workflow history must remain understandable after configuration changes.

## 10. Data and database rules

Use UUIDs for internal primary identifiers unless a documented exception exists.
Human-readable serial numbers are separate from internal IDs.
Use foreign keys and database constraints to protect invariants where practical.
Use unique constraints for identifiers that must never collide.
Use indexes based on actual query patterns, not speculation.
Store timestamps consistently and preserve the original event time.
Use decimal database types for measured material values such as weights.
Never use floating-point types for values where decimal precision affects business calculations.
Schema changes must be performed through migrations.
Do not edit production data manually as a substitute for a migration or domain operation.
Use transactions when multiple writes together represent one business action.

## 11. Audit and history

Important business actions must produce an audit record.
Audit records are append-only.
Audit records should capture actor, action, target, time, organization, and relevant before/after context.
Product movement history is business data and must not be treated as disposable application logs.
Application logs and audit history serve different purposes and must remain separate.
Never log passwords, authentication secrets, session tokens, or other credentials.

## 12. Validation and API boundaries

Validate all untrusted input on the server.
Use Zod schemas for request and command validation.
Client validation improves UX but never replaces server validation.
Return safe DTOs instead of raw Prisma records.
Do not expose fields merely because they exist in the database.
Use typed error categories for validation, authentication, authorization, conflict, not-found, and unexpected failures.
Do not leak internal stack traces or database errors to end users.

## 13. TypeScript rules

Keep TypeScript strict.
Do not use any unless there is a documented and justified boundary case.
Prefer unknown over any for untrusted values.
Use explicit domain types for identifiers, statuses, permissions, and commands where they improve safety.
Avoid duplicated string literals for domain constants.
Exhaustively handle finite domain states where practical.
Do not suppress TypeScript errors simply to make a build pass.

## 14. Frontend rules

Design mobile-first because production workers primarily use personal phones.
The worker flow must minimize taps and typing.
Scanning must be usable from a phone camera.
User-facing text must come from i18n translation resources.
Do not hard-code Hebrew, English, or Russian UI text inside feature components.
Default language is Hebrew unless the user preference selects another supported language.
Accessibility and clear error feedback are required for critical production actions.
Do not optimistically show a state transition as successful until the server has accepted it.

## 15. Security baseline

Treat all browser input as untrusted.
Keep secrets only in environment variables or an approved secret store.
Validate environment configuration at startup.
Use secure cookie settings in production.
Protect authentication and scan endpoints against abuse with appropriate rate limiting.
Apply CSRF protection when required by the chosen mutation model.
Avoid mass-assignment vulnerabilities by mapping accepted fields explicitly.
Use safe query construction through the ORM.
Keep dependencies current through deliberate upgrades, not unrelated automatic rewrites.
Security-sensitive failures must be logged without exposing secrets.

## 16. Testing requirements

Business rules require unit tests.
Database invariants, authorization, and tenant isolation require integration tests.
Critical user journeys require end-to-end tests.
Every fixed bug should receive a regression test when practical.
Scanning tests must cover duplicate requests.
Scanning tests must cover concurrent requests.
Authorization tests must verify both allowed and denied cases.
Tenant isolation tests must verify that valid users cannot access another organization.
Tests must verify invalid state transitions are rejected.
Do not delete or weaken tests only to make a change pass.

## 17. Observability and errors

Use structured logs with useful request and domain context.
Include correlation or request identifiers where practical.
Do not use console.log as the production logging strategy.
Expected domain conflicts should produce clear, actionable messages.
Unexpected errors should be captured for investigation without leaking internals to the user.
Audit events, application logs, and user-facing errors are separate concerns.

## 18. Scope discipline

The MVP does not require microservices.
The MVP does not require Kubernetes.
The MVP does not require Redis unless a concrete feature proves the need.
The MVP does not require product photos.
The MVP does not require a shipping module.
Do not add AI features until the core production tracking system is reliable.
Do not build speculative abstractions for hypothetical future factories.
Keep the domain generic while implementing only real current requirements.

## 19. Development workflow

Read the relevant project documentation before changing architecture or domain behavior.
Inspect existing code before creating a new abstraction or duplicate implementation.
Follow the existing project naming and folder conventions.
Run formatting, linting, type checking, and relevant tests before considering a task complete.
Do not hide failing checks.
Do not modify unrelated files without a clear reason.
Do not delete user code or reset unrelated local changes.
Avoid destructive Git operations unless explicitly requested.
When adding a dependency, explain the concrete need and prefer a maintained, focused package.
When changing a domain rule, update tests and documentation together.

## 20. Definition of done

A feature is not done because the UI works.
A feature is done when its business rules are correct.
A feature is done when server-side authorization is enforced.
A feature is done when tenant isolation is preserved.
A feature is done when input validation and error handling are implemented.
A feature is done when state-changing operations are transactionally safe where required.
A feature is done when relevant audit or history records are created.
A feature is done when appropriate tests pass.
A feature is done when documentation reflects any new architectural or domain decision.

## 21. Decision priority

When instructions conflict, follow this order:

1. The user's explicit current request.
2. The current approved product specification and project documentation.
3. This AGENTS.md file.
4. Existing implementation conventions.
5. General framework conventions.
   If a conflict affects security, data integrity, tenant isolation, or irreversible behavior, choose the safer path and surface the conflict instead of guessing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
