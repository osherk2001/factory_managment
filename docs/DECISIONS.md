# DECISIONS.md

## Decision log

### D-001: Product starts in CREATED

Status: Approved

Decision:

A newly created Product starts with status `CREATED`.

Reason:

The Product exists in the system immediately after creation, but no worker has started handling it yet.

---

### D-002: CREATED products are scannable

Status: Approved

Decision:

A Product does not require a separate activation step before workers can scan it.

Reason:

The manager's act of creating the Product is sufficient to make it available for production.

Consequence:

Do not implement a `CREATED -> ACTIVE` activation gate unless the product specification changes.

---

### D-003: First worker scan may start production

Status: Approved

Decision:

The first valid worker receive scan may transition a Product from `CREATED` to `IN_PROGRESS`.

The scan must also record:

- responsible worker
- active role
- current location
- timestamp
- history event

---

### D-004: Current state dimensions remain separate

Status: Approved

Decision:

The following are separate domain concepts:

- Product status
- current worker
- current role
- current location

Reason:

A single status field cannot accurately represent responsibility, location, and lifecycle state.

---

### D-005: Product history is append-only

Status: Approved

Decision:

Historical movement and responsibility events are never overwritten to correct a mistake.

A correction creates a new event.

Reason:

FactoryFlow must preserve a trustworthy history of what actually happened.

---

### D-006: FactoryFlow is multi-tenant

Status: Approved

Decision:

Each factory is represented by an `Organization`.

Tenant data must be isolated by organization.

Cross-tenant access is considered a critical security defect.

---

### D-007: First customer does not define the core domain

Status: Approved

Decision:

The first customer is a jewelry factory, but FactoryFlow core logic must remain factory-agnostic.

Reason:

The product is intended to support additional factories in the future.

---

### D-008: Start with a modular monolith

Status: Approved

Decision:

FactoryFlow will start as a modular monolith.

Reason:

It provides clear domain boundaries without adding the operational complexity of microservices.

---

### D-009: Initial technology baseline

Status: Approved

Decision:

Initial stack:

- TypeScript
- Next.js App Router
- React
- PostgreSQL
- Prisma
- Zod
- Auth.js
- Tailwind CSS
- shadcn/ui
- Vitest
- Playwright
- Docker Compose

Changes to foundational technology require an explicit architectural decision.

---

### D-010: Server-side authorization is mandatory

Status: Approved

Decision:

Protected actions must be authorized on the server.

Hiding UI actions is not considered a security control.

---

### D-011: Prefer permissions over role-name checks

Status: Approved

Decision:

Business logic should check capabilities such as `scans.perform` instead of depending directly on fixed role names.

Reason:

Roles may evolve and may differ between organizations.

---

### D-012: Scan is a business mutation

Status: Approved

Decision:

A scan that changes Product state or responsibility must be treated as a transactional business operation.

It must be:

- validated
- authorized
- atomic
- idempotent
- concurrency-safe

---

### D-013: Barcode payload is not a sequential database ID

Status: Approved

Decision:

Barcode values must be unique and non-guessable.

Sequential internal IDs must not be used directly as barcode payloads.

---

### D-014: Workflow configuration must remain generic

Status: Approved

Decision:

Jewelry-specific production stages must not be hard-coded into the core workflow engine.

---

### D-015: Workflow history must survive template changes

Status: Approved

Decision:

A reusable `WorkflowTemplate` and a preserved `WorkflowSnapshot` are separate concepts.

Changing a template must not silently change historical Product behavior.

---

### D-016: Work completion is performed from the worker's personal area

Status: Approved

Decision:

A worker finishes work from their personal work area. Scanning alone never
automatically finishes work.

If the same worker scans an `IN_PROGRESS` Product they currently hold, the
scan may open an explicit finish-work confirmation. Only confirming that
action executes the normal finish-work operation.

The worker must open the Product from their personal work area and press `Finish work`.

The finish action is a server-side business operation that closes the active responsibility period, records completion time, appends Product history, and moves the Product toward the handoff state according to the workflow.

Consequence:

A repeated scan by the same worker must not finish work without explicit
confirmation.

---

### D-017: READY_FOR_HANDOFF has no active worker responsibility

Status: Approved

Decision:

When a worker successfully finishes work and the Product enters `READY_FOR_HANDOFF`:

- the active ProductAssignment is closed
- `currentWorker` is cleared
- `currentRole` is cleared
- the last worker and role remain preserved in historical assignment and transition records

Reason:

`READY_FOR_HANDOFF` means the previous worker has completed responsibility and no next worker has accepted the Product yet.

Consequence:

Current responsibility and historical responsibility must be modeled separately.

---

### D-018: READY_FOR_HANDOFF preserves current location

Status: Approved

Decision:

When a Product moves from `IN_PROGRESS` to `READY_FOR_HANDOFF`, `currentLocation` is not cleared.

Reason:

The previous worker may have finished responsibility, but the Product still physically exists at its last known location until another worker receives it or an authorized transfer changes the location.

Consequence:

Responsibility may be empty while location remains populated.

---

### D-019: Receiving READY_FOR_HANDOFF creates a new active assignment

Status: Approved

Decision:

When an authorized worker scans a Product in `READY_FOR_HANDOFF`, the system receives the Product into that worker's responsibility.

The operation must:

- create a new ProductAssignment
- set `currentWorker` to the receiving worker
- set `currentRole` to the worker's active role
- update `currentLocation` to the new handling location
- transition the Product to `IN_PROGRESS`
- append a ProductTransition

Reason:

Receiving the Product starts a new responsibility period and must be distinguishable from the previous worker's completed assignment.

Consequence:

Every handoff creates a new historical responsibility period instead of reusing or overwriting the previous one.

---

### D-020: Product completion requires an explicit authorized action

Status: Approved

Decision:

A Product is not completed by barcode scanning.

An authorized user must explicitly complete a Product.

Confirmed transition:

`READY_FOR_HANDOFF -> COMPLETED`

When completion succeeds:

- `status = COMPLETED`
- `currentWorker = null`
- `currentRole = null`
- `currentLocation` remains unchanged
- completion time is recorded
- ProductTransition is appended
- an audit record is created

A completed Product is excluded from normal worker receive scans.

Reason:

Completion is a significant lifecycle decision and should not happen accidentally through a routine scan.

---

### D-021: Same-department scan of a completed Product may offer controlled return to process

Status: Approved

Decision:

If a worker scans a Product whose status is `COMPLETED`, and the scan occurs in the same department in which the Product was last handled before completion, the system does not immediately reject the scan and does not immediately reopen the Product.

Instead, the system displays a warning that the Product was marked as completed, including the user who performed the completion action.

The worker is presented with two choices:

- `Return to process`
- `Cancel`

`Cancel` makes no changes.

`Return to process` is an explicit business action. It must:

- be authorized on the server
- create a new ProductTransition
- create an audit record
- preserve all prior history
- move the Product back into an active production flow according to the defined reopen/rework rule

Reason:

A completed Product may legitimately require additional work in the same department, but returning it to production must never happen accidentally from a routine scan.

---

### D-022: Return to process from completed starts a new active assignment

Status: Approved

Decision:

When a worker scans a `COMPLETED` Product in the same previous department and chooses `Return to process`, the Product returns directly to active work.

The operation must:

- set `status = IN_PROGRESS`
- create a new ProductAssignment for the scanning worker
- set `currentWorker` to the scanning worker
- set `currentRole` to the worker's active role
- set `currentLocation` to the worker's current department/location
- append a ProductTransition
- create an audit record
- preserve all previous completion, assignment, and transition history

Reason:

Choosing `Return to process` means the worker is actively taking responsibility for additional work immediately.

---

### D-023: Scanning a completed Product in another department transfers it into that department

Status: Approved

Decision:

If a worker scans a `COMPLETED` Product from a different department than the Product's last pre-completion department, the Product moves into the scanning worker's department and immediately returns to active work.

The operation must:

- set `status = IN_PROGRESS`
- create a new ProductAssignment for the scanning worker
- set `currentWorker` to the scanning worker
- set `currentRole` to the worker's active role
- set `currentLocation` to the scanning worker's department/location
- append a ProductTransition
- create an audit record
- preserve all historical assignments, transitions, and completion records

Reason:

A scan in another department represents an intentional physical handoff into a new production responsibility area.

---

### D-024: Active Product may be explicitly taken over by the next scanning worker

Status: Approved

Decision:

If a worker scans a Product that is already `IN_PROGRESS` with another worker, the system displays a warning identifying the current worker.

The scanning worker may choose:

- `The Product is now with me`
- `Cancel`

`Cancel` makes no changes.

`The Product is now with me` transfers responsibility to the scanning worker.

The operation must:

- close the previous active ProductAssignment
- create a new ProductAssignment
- keep `status = IN_PROGRESS`
- update `currentWorker`
- update `currentRole`
- update `currentLocation`
- append a ProductTransition
- create an audit record
- preserve the previous assignment in history
- be atomic and concurrency-safe

Reason:

The physical Product may move between workers before the previous worker explicitly finishes, but the system must make that takeover visible and intentional.

---

### D-025: Same-worker rescan may confirm finish work

Status: Approved

Decision:

Scanning alone never automatically finishes work.

If a worker scans a Product that is already `IN_PROGRESS` and currently assigned to that same worker, the system may show a confirmation popup asking whether to finish the current work.

Available actions:

- `Yes`
- `No`

`No` makes no changes.

Only choosing `Yes` executes the normal finish-work operation:

- close the active ProductAssignment
- record completion time
- set `currentWorker = null`
- set `currentRole = null`
- keep `currentLocation` unchanged
- set `status = READY_FOR_HANDOFF`
- append a ProductTransition
- create an audit record

Reason:

This provides a fast worker flow while preventing accidental completion from a routine or duplicate scan.

---

### D-026: Cancelled Products may be restored

Status: Approved

Decision:

A `CANCELLED` Product may be restored by an authorized user.

Confirmed transition:

`CANCELLED -> READY_FOR_HANDOFF`

Restore does not assign the Product to a worker.

When restore succeeds:

- `currentWorker = null`
- `currentRole = null`
- `currentLocation` remains unchanged
- the Product becomes available for a later valid receive scan
- a ProductTransition is appended
- an audit record is created
- all prior history remains preserved

Reason:

Cancellation may happen by mistake or may later be reversed, and restoration must not erase historical truth.

---

### D-027: TRASHED is logical removal, not immediate deletion

Status: Approved

Decision:

A Product may move from `CANCELLED` to `TRASHED`.

`TRASHED` means the Product is removed from normal operational views and scan flows but remains stored with its history.

Physical deletion is handled separately through a retention policy.

Reason:

Products with barcodes, assignments, transitions, issues, weights, and audit history should not be physically deleted as part of a routine operational action.

---

### D-028: Workflow supports backward movement and repeated stages

Status: Approved

Decision:

FactoryFlow workflows are not strictly forward-only.

A Product may move forward, move backward, enter rework, or visit the same production stage more than once when allowed by the configured workflow.

All movements remain preserved in ProductTransition history.

Reason:

Real factory production does not always follow a perfect linear path.

---

### D-029: Worker selects an active operational role

Status: Approved

Decision:

A worker may have multiple operational roles.

The worker selects an `activeRole` from the home screen before handling Products.

The selected role is used for future scan and receive operations until the worker changes it.

The server must verify that the worker is authorized for the selected role.

The active role is recorded on new ProductAssignments and relevant ProductTransitions.

Changing active role does not modify historical assignments.

If the worker has exactly one operational role, the UI may select it automatically.

Reason:

The same worker may perform different production functions, and the system must know which role the worker is performing at the time of each action.

---

### D-030: Active role determines the production stage

Status: Approved

Decision:

A worker may be authorized for multiple operational roles.

For each handling action, the worker's currently selected `activeRole` determines the production stage used by the system.

Example:

A worker who can perform both `POLISHER` and `STONE_SETTER` selects the role they are currently performing from the home screen.

The selected role is recorded on the ProductAssignment and relevant ProductTransition together with the corresponding production stage.

Changing the active role affects future actions only and never rewrites history.

Reason:

The same employee may perform different production functions, so stage resolution must depend on the role being performed at the time of the action rather than on worker identity.

---

### D-031: Workflow does not block receiving based on expected next stage

Status: Approved

Decision:

A valid worker scan is not blocked solely because the worker's selected `activeRole` does not match the expected next workflow role or stage.

If the worker is authorized for the selected role and the Product can otherwise be received:

- the receive action is allowed
- the selected active role determines the recorded production stage
- the actual movement is appended to ProductTransition history

Reason:

FactoryFlow is primarily a tracking system. It should record the real production path without forcing workers into a rigid digital sequence.

Consequence:

Workflow expectations and actual Product movement must be modeled separately.

---

### D-032: AccessRole and ProductionRole are separate concepts

Status: Approved

Decision:

FactoryFlow separates software authorization from production work context.

`AccessRole` is used for authorization and grants Permissions.

`ProductionRole` represents the production function a worker is currently performing, such as polishing or stone setting.

A worker may have multiple ProductionRoles and selects one active ProductionRole for handling Products.

ProductAssignments and ProductTransitions record the ProductionRole used at the time of work.

Reason:

Authorization responsibilities and factory production functions are different concerns and must not share one database concept.

---

## Pending decisions

The following still require product decisions before implementation:

- undo behavior
- manual status-change permissions
- order lifecycle
- workflow-stage model
- exact location rules
- barcode format and printer standard
