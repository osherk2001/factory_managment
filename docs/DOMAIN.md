# DOMAIN.md

## 1. Purpose

This document defines the core business domain of FactoryFlow before database implementation.

FactoryFlow tracks individual physical products through a factory production process.

The system must answer, for every tracked product:

- Where is the product now?
- Who is responsible for it now?
- What role is currently handling it?
- What is its current production state?
- What happened to it previously?
- Which workers handled it?
- Is there an active issue?
- Is it delayed or urgent?

The first customer is a jewelry factory, but core domain concepts must remain factory-agnostic.

## 2. Core entities

### Organization

Represents one factory tenant.

Responsibilities:

- Owns users, products, orders, workflows, locations, roles, permissions, and history.
- Defines the tenant boundary for all factory data.

Rules:

- Tenant-owned records must belong to exactly one Organization.
- Cross-organization access is forbidden unless explicitly performed by a system-level administrator.

### User

Represents an authenticated system account.

Responsibilities:

- Logs into the system.
- Performs actions.
- May belong to one or more organizations through memberships.
- Has permissions through roles or explicit authorization rules.

Rules:

- Shared accounts are not allowed.
- Authentication identity and employee/business identity may be modeled separately if required.

### Membership

Represents a User's membership in an Organization.

Responsibilities:

- Connects a User to an Organization.
- Defines organization-specific roles and permissions.

Rules:

- Access to tenant data requires a valid Membership.
- A User must not gain access to another Organization merely by knowing its identifier.

### Employee

Represents a worker or staff member inside a factory.

Responsibilities:

- May handle products.
- May work under one or more production roles.

Rules:

- A worker may perform multiple roles.
- A worker may hold multiple products at the same time.

### Customer

Represents the business customer associated with a production order.

Responsibilities:

- Owns or is associated with one or more production orders.

### ProductionOrder

Represents a production order.

Responsibilities:

- Groups one or more Product units.
- Stores order-level customer and production context.

Rules:

- One order may contain multiple different products.
- Every physical product is tracked individually even when it belongs to the same order.

### Product

Represents one individually tracked physical production unit.

Responsibilities:

- Holds current state.
- Holds current responsible worker.
- Holds current active role.
- Holds current location.
- Has a unique barcode.
- Has immutable movement and activity history.

Rules:

- Product receives an internal unique identifier.
- Product receives a human-readable serial number.
- Product receives a unique barcode value.
- A newly created Product starts with status `CREATED`.
- A Product in `CREATED` is already scannable.
- `CREATED` means that the Product exists but no worker has started handling it yet.
- The first valid worker scan may move the Product to `IN_PROGRESS`.
- Product status, current worker, current role, and current location are separate concepts.
- Product history must not be overwritten.
- A Product may move between workers, roles, and locations many times.

### Barcode

Represents the machine-readable identifier attached to a Product.

Responsibilities:

- Resolves a physical scan to exactly one Product.

Rules:

- Barcode values must be unique.
- Barcode values must not expose sensitive business data.
- Sequential database IDs must not be used directly as barcode payloads.
- Barcode printing and reprinting require authorization.
- Printing and reprinting must be auditable.

### Role

Represents an operational or administrative role.

Examples:

- Factory Admin
- Production Manager
- Worker
- Quality Control
- Viewer

Rules:

- Roles are collections of permissions.
- Business logic should prefer permission checks over hard-coded role names.
- A worker may have multiple operational roles.
- The worker's active role at the time of handling a Product must be recorded.

### Permission

Represents an allowed system capability.

Examples:

- products.create
- products.update
- products.complete
- scans.perform
- issues.create
- users.manage
- audit.read

Rules:

- Authorization is enforced on the server.
- Client-side visibility does not replace authorization.

### Location

Represents the current physical or logical location of a Product.

Examples:

- Production department
- Safe
- Storage
- Waiting area
- External contractor
- Worker-associated production location

Rules:

- Location is independent from Product status.
- A Product may be moved to a non-worker location only by an authorized action.

### ProductAssignment

Represents responsibility for a Product during a period of work.

Responsibilities:

- Records which employee handled the Product.
- Records the active role.
- Records start time and end time.

Rules:

- Assignments are historical records.
- Closing one assignment and opening another must preserve history.
- A Product must never be actively assigned to two workers because of a race condition.

### ProductTransition

Represents a state or handling transition in the Product lifecycle.

Responsibilities:

- Records what changed.
- Records who performed the change.
- Records when it happened.
- Preserves before and after context when needed.

Rules:

- Transitions are append-only.
- Corrections create new events instead of rewriting old events.
- Invalid state transitions must be rejected.
- Manual transitions require explicit permission and auditing.

### WorkflowTemplate

Represents a reusable production process definition.

Responsibilities:

- Defines available production stages and allowed progression rules.

Rules:

- Core logic must not hard-code jewelry-specific stages.
- A template row is an immutable version; changes create a new version.
- Only active tenant versions may be selected for new Products.
- Stage codes and positive positions are unique within a version.

### WorkflowSnapshot

Represents the workflow definition assigned to a specific Product or production instance.

Responsibilities:

- Preserves the effective workflow even if the template changes later.

Rules:

- Editing a WorkflowTemplate must not silently alter historical Product behavior.
- Snapshot stages are copied atomically during Product creation.
- A Product may intentionally have no workflow snapshot.

### Issue

Represents a production problem associated with a Product.

Responsibilities:

- Records the issue type, description, status, reporter, timestamps, and resolution.

Rules:

- Initial lifecycle is `OPEN` and `RESOLVED`.
- An active issue does not automatically stop production unless a later business rule explicitly says so.
- Resolved issues remain in history.

### WeightEvent

Represents a material weight measurement or adjustment.

Possible types:

- EXPECTED
- ISSUED
- FINAL
- RETURNED
- APPROVED_LOSS

Rules:

- Weight events are append-only.
- Corrections are represented by new events.
- Use decimal precision suitable for grams.
- Business calculations must not use floating-point arithmetic where precision matters.

### AuditLog

Represents security and administrative audit history.

Responsibilities:

- Records important business and administrative actions.
- Stores actor, action, target, organization, timestamp, and relevant context.

Rules:

- AuditLog is append-only.
- Audit history is different from technical application logs.

## 3. Product lifecycle

Current confirmed Product states:

- `CREATED`
- `IN_PROGRESS`
- `READY_FOR_HANDOFF`
- `COMPLETED`
- `CANCELLED`
- `TRASHED`

Additional states must not be introduced without an explicit domain decision.

### Confirmed transition

```text
Product created
    ↓
CREATED
    ↓ first valid worker receive scan
IN_PROGRESS
```

Current confirmed meaning:

### CREATED

- Product exists in the database.
- Product details can be viewed.
- Barcode exists.
- Barcode can be printed.
- Product is scannable.
- No worker has started handling it yet.

### IN_PROGRESS

- A worker is currently handling the Product.
- Current worker is recorded.
- Active role is recorded.
- Current location is recorded.
- Product history includes the receive action.

### READY_FOR_HANDOFF

- Work in the current responsibility period has been explicitly finished.
- No worker or ProductionRole is currently responsible for the Product.
- The last known physical Location remains stored.
- `completedAt` is reserved for explicit Product completion and is not set by
  Finish work.

### COMPLETED

- Completion is an explicit authorized operation from `READY_FOR_HANDOFF`.
- `completedAt` records the completion instant.
- No current worker, ProductionRole, or active ProductAssignment remains.
- A completed Product is not silently reopened by a scan.

### CANCELLED and TRASHED

- Cancellation is an explicit authorized operation from `CREATED`,
  `IN_PROGRESS`, or `READY_FOR_HANDOFF`.
- `cancelledAt` records entry into `CANCELLED` and is cleared when a cancelled
  Product is restored or moved to `TRASHED`.
- Restoration is an explicit authorized operation from `CANCELLED` to
  `READY_FOR_HANDOFF`; it does not create an assignment.
- Logical trash is an explicit authorized operation from `CANCELLED` to
  `TRASHED`. The Product row and its history remain stored.

## 4. Scan domain rules

A scan is a business mutation, not only a Product lookup.

Scanning is used to receive or inspect a Product according to the user's permissions and current flow.

Finishing work is not triggered by scanning the barcode again.

A valid receive scan must:

1. Identify the authenticated user.
2. Resolve the worker and active organization.
3. Verify `scans.perform`.
4. Resolve the Product by barcode.
5. Verify tenant ownership.
6. Validate the current Product state.
7. Validate the requested transition.
8. Assign responsibility.
9. Record the active role.
10. Update the current location if applicable.
11. Update Product state if required.
12. Create history records.
13. Commit all related writes atomically.

Scan operations must be:

- Authorized
- Validated
- Atomic
- Idempotent
- Concurrency-safe

Two concurrent scans must never leave the same Product assigned to two workers.

Repeated delivery of the same scan request must not create duplicate transitions.

### Receiving a Product from READY_FOR_HANDOFF

For a Product in `READY_FOR_HANDOFF`, a valid receive scan:

1. validates the authenticated worker
2. validates the active organization
3. validates `scans.perform`
4. validates that the Product belongs to the same Organization
5. validates that the Product is still in `READY_FOR_HANDOFF`
6. creates a new ProductAssignment
7. sets `currentWorker` to the receiving worker
8. sets `currentRole` to the worker's active role
9. updates `currentLocation` to the new handling location
10. transitions the Product to `IN_PROGRESS`
11. appends a ProductTransition
12. commits the operation atomically

Confirmed transition:

`READY_FOR_HANDOFF -> IN_PROGRESS`

## 5. Important domain invariants

- Every tenant-owned record belongs to one Organization.
- Every Product has one unique internal ID.
- Every Product has one unique barcode value.
- Product status is not the same thing as Product location.
- Product status is not the same thing as Product responsibility.
- Product history is append-only.
- Audit history is append-only.
- Invalid state transitions are rejected.
- Cross-tenant access is forbidden.
- Protected actions are authorized on the server.
- A Product cannot be actively assigned to two workers because of concurrent requests.

## 6. Finish-work domain rule

The worker finishes work from their personal work area.

Confirmed flow:

1. Worker opens their personal work area.
2. Worker opens a Product currently assigned to them.
3. Worker presses `Finish work`.
4. The server validates that the worker is allowed to finish the current assignment.
5. The current responsibility period is closed.
6. Product history is appended.
7. The Product moves to `READY_FOR_HANDOFF`.

Current expected state transition:

`IN_PROGRESS -> READY_FOR_HANDOFF`

When this transition succeeds:

- the active ProductAssignment is closed
- `currentWorker` becomes `null`
- `currentRole` becomes `null`
- `currentLocation` remains unchanged
- the previous worker and role remain preserved in ProductAssignment and ProductTransition history
- the Product has no active worker responsibility until the next valid receive or transfer action
- the last known physical location remains visible until a later action changes it

If the same worker who currently owns the active ProductAssignment scans the Product again while it is `IN_PROGRESS`, the scan opens a finish-work confirmation.

The system offers:

- `Yes`
- `No`

`No` leaves the Product unchanged.

`Yes` executes the same server-side finish-work business operation as pressing `Finish work` from the worker's personal area.

The repeated scan itself must never complete the operation without explicit confirmation.

## 7. Completion domain rule

Product completion is an explicit authorized business operation.

Confirmed transition:

`READY_FOR_HANDOFF -> COMPLETED`

Rules:

- barcode scanning does not automatically complete a Product
- the caller must have explicit completion permission
- `currentWorker` must be `null`
- `currentRole` must be `null`
- `currentLocation` remains the last known physical location
- completion time must be recorded
- ProductTransition history must be appended
- the action must be audited
- a completed Product cannot silently return to production through the normal worker scan flow
- scanning a completed Product from the same department as its last pre-completion handling location may trigger a controlled reopen prompt
- the prompt must identify the user who marked the Product as completed
- the worker can either cancel or explicitly return the Product to the process
- cancel leaves the Product unchanged
- return-to-process must be authorized, audited, and represented as a new transition
- a successful return-to-process creates a new ProductAssignment for the scanning worker
- `status` becomes `IN_PROGRESS`
- `currentWorker` becomes the scanning worker
- `currentRole` becomes the worker's active role
- `currentLocation` becomes the worker's current department/location
- all prior completion and assignment history remains preserved

Reopening a completed Product is a separate business operation even when it is initiated from a scan warning.

The return-to-process operation requires both `products.reopen` and
`scans.perform`. It resolves the active EmployeeProfile, ProductionRole, and
handling Location inside the transaction, after acquiring the EmployeeProfile
production-mutation lock. It clears `completedAt`, creates the new active
assignment, and increments the Product version.


### Scanning a completed Product in a different department

The scan remains a read-only classification and does not automatically
transfer or reopen the Product. A worker with the explicit reopen capability
may choose the separate return-to-process operation, which applies the same
authorization and transaction rules regardless of the department.


### Transfer from one active worker to another

If a Product is `IN_PROGRESS` and currently assigned to another worker, a new scan does not immediately overwrite responsibility.

The scanning worker must first receive a warning that identifies the current worker and then explicitly choose whether to take responsibility.

Available actions:

- `The Product is now with me`
- `Cancel`

`Cancel` leaves the Product unchanged.

A successful takeover must:

1. revalidate the Product state inside the transaction
2. close the previous active ProductAssignment
3. create a new ProductAssignment for the scanning worker
4. keep `status = IN_PROGRESS`
5. set `currentWorker` to the scanning worker
6. set `currentRole` to the scanning worker's active role
7. set `currentLocation` to the scanning worker's current department/location
8. append a ProductTransition
9. create an audit record
10. preserve the previous worker's assignment in history

The operation must be atomic and concurrency-safe.

## 8. Lifecycle mutation safety

Every Phase 8 lifecycle mutation validates a tenant-scoped Product and the
caller-provided expected `Product.version`, then performs a compare-and-set
update in one database transaction. The operation is idempotent: the same
tenant/user/idempotency-key and request replays the stored safe result, while a
changed request with that key is rejected. Concurrent requests cannot create
two active assignments or duplicate lifecycle history.

The Product status is authoritative. Timestamps are evidence of the relevant
transition, not an alternative status machine.

## 9. Open decisions

These decisions are intentionally not finalized yet:

- Exact rework and backward-movement rules.
- Exact manual status-change permissions.
- Exact order lifecycle.
- Exact workflow-stage model.
- Exact relationship between role and location.
- Exact barcode symbology and printer model.
- Exact undo behavior.

These decisions must be resolved before implementing the affected domain behavior.

## Cancellation and restore domain rules

### CANCELLED

`CANCELLED` means the Product was intentionally removed from the active production flow.

Cancellation is an explicit authorized business operation.

When a Product is cancelled:

- any active ProductAssignment is closed
- `currentWorker` becomes `null`
- `currentRole` becomes `null`
- `currentLocation` remains unchanged
- Product history remains append-only
- the Product cannot be received through the normal worker scan flow
- the Product remains available to authorized management views

A cancelled Product may be restored.

Confirmed transition:

`CANCELLED -> READY_FOR_HANDOFF`

Restore rules:

- restore requires explicit permission
- restore does not create an active ProductAssignment
- `currentWorker` remains `null`
- `currentRole` remains `null`
- `currentLocation` remains the last known location
- the Product becomes eligible for a later receive scan
- ProductTransition history and AuditLog are appended

### TRASHED

`TRASHED` is a logical removal state, not immediate physical deletion.

Confirmed transition:

`CANCELLED -> TRASHED`

Rules:

- a trashed Product is excluded from normal operational flows
- a trashed Product cannot be received by workers
- history remains preserved
- physical deletion is a separate retention-policy concern

## Workflow and role domain rules

### Workflow movement

Production workflow is configurable and is not limited to a strictly forward sequence.

A Product may:

- move forward
- return to a previous stage
- enter rework
- visit a stage more than once

Every movement must remain visible in ProductTransition history.

Historical transitions are never removed to make the workflow appear linear.

Phase 9 classifies actual handling as `INITIAL`, `FORWARD`, `BACKWARD`,
`REPEAT`, or `UNMAPPED`. Backward and repeat movement is rework. A movement
that differs from the position-based expected next stage is a non-blocking
deviation.

### Active role

A worker may be authorized for multiple operational roles.

The worker selects one `activeRole` from the home screen before handling Products.

Rules:

- `activeRole` is part of the worker's current session or working context
- the server must verify that the worker is authorized for the selected role
- a ProductAssignment records the active role used when responsibility starts
- ProductTransition history records the role involved in the transition
- changing the worker's active role affects future actions only
- changing active role must not rewrite existing ProductAssignments
- if the worker has multiple roles, the UI must allow explicit selection
- if the worker has exactly one operational role, the UI may select it automatically

The active role determines the production stage for the worker's handling action.

Workflow expectations do not block a valid receive action solely because the worker's `activeRole` is not the expected next role or stage.

If the worker is authorized and the Product can otherwise be received:

- the receive action is allowed
- the selected active role determines the recorded stage
- the actual movement is appended to ProductTransition history

When one active role maps to multiple stages in the Product snapshot, the
worker must explicitly select one safe candidate before mutation. A role with
no mapped stage may still handle the Product; the assignment stage is null,
the Product's prior current stage is preserved, and the transition records an
`UNMAPPED` deviation.

A worker may be authorized for multiple roles, for example `POLISHER` and `STONE_SETTER`, but only the currently selected active role is used for the current ProductAssignment and transition.

### Worker production context

The authenticated tenant Membership resolves to one active EmployeeProfile
before the worker home screen is loaded. The worker's selected
ProductionRole is persisted in `WorkerProductionContext` so it remains
available across requests and login sessions.

Rules:

- the context is tenant-scoped and unique per EmployeeProfile
- the selected role must be assigned to that EmployeeProfile and remain active
- a single available role is effective automatically and need not be persisted
- multiple available roles require explicit selection before handling work
- a stale or removed selection is ignored and revalidated against current assignments
- the context does not grant authorization and does not mutate Product state

The worker home screen reads only Products currently in `IN_PROGRESS` with the
trusted EmployeeProfile as `currentWorker`.

## Access roles and production roles

FactoryFlow has two different role concepts.

### AccessRole

Represents authorization inside the software.

Examples:

- Factory Admin
- Production Manager
- Worker
- Quality Control
- Viewer

AccessRoles grant Permissions.

### ProductionRole

Represents the actual production function performed by a worker.

Examples:

- Polisher
- Stone Setter
- Cleaner

A worker may have multiple ProductionRoles.

The worker selects one active ProductionRole before handling Products.

ProductAssignment and ProductTransition store the ProductionRole used at the time of work.

AccessRole and ProductionRole are intentionally separate domain concepts.
