# PRD.md

## 1. Product

FactoryFlow is a multi-tenant Manufacturing Execution System for small and medium-sized factories.

The first implementation is for a jewelry factory, but the product must remain configurable and factory-agnostic.

## 2. Core promise

At any moment, an authorized user should be able to determine:

- where each Product is
- who is currently responsible for it
- which role is currently handling it
- when it was received
- when work was completed
- where it was previously
- which employees handled it
- whether it is delayed
- whether it has an active issue
- relevant material and weight history

## 3. MVP users

### System Admin

Manages platform-level operations.

Initial responsibilities:

- create Organizations
- create or onboard the first factory administrator
- perform explicitly authorized system-level administration

### Factory Admin

Manages one factory.

Initial responsibilities:

- manage users
- manage roles and permissions
- create and manage Products and Orders
- view all Product state and history
- perform authorized manual corrections
- view operational dashboards and reports

### Production Manager

Manages production operations.

Initial responsibilities:

- create or update production data according to permissions
- inspect Product state
- inspect Product history
- manage operational exceptions
- perform authorized transfers and status changes

### Worker

Performs production work.

Initial responsibilities:

- sign in with a personal account
- select or use an active production role
- scan Product barcodes
- receive Products
- finish handling Products
- view the Product information required for the assigned work

### Quality Control

Performs quality-related work according to permissions.

### Viewer

Read-only or limited-read access according to permissions.

## 4. Product creation

An authorized user can create a Product.

Creating a Product must:

1. validate Product data
2. create the Product in the database
3. generate a unique internal identifier
4. generate a human-readable Product serial number
5. generate a unique barcode value
6. set Product status to `CREATED`
7. create required audit records

After creation:

- the Product is immediately scannable
- the barcode can be printed
- no separate activation step is required

## 5. Barcode

Every physical Product receives its own barcode.

Requirements:

- barcode uniquely resolves one Product
- barcode payload must not be a predictable sequential database identifier
- single Product barcode printing is supported
- reprinting is supported with permission
- printing and reprinting are audited
- barcode scanning must work from a mobile phone
- exact barcode symbology remains replaceable until hardware validation is complete

## 6. Worker scan flow

Workers primarily use personal mobile phones.

A scan is a state-changing business operation.

### First receive

When an authorized worker scans a valid Product that can be received:

- identify the Product
- validate tenant ownership
- validate Product state
- validate worker permission
- record the worker
- record the worker's active role
- update current location
- create or open the relevant responsibility period
- record Product history
- transition Product state where required

For a newly created Product:

`CREATED -> IN_PROGRESS`

### Finish work

Finishing work is not performed by scanning the barcode again.

The current worker finishes work by:

1. opening their personal work area
2. opening the Product currently assigned to them
3. pressing `Finish work`
4. confirming the action if confirmation is required by the UI

When the finish action succeeds:

- the current responsibility period is closed
- completion time is recorded
- Product history is updated
- Product becomes available for the next handling step according to the workflow

The expected handoff state is `READY_FOR_HANDOFF`.

When the Product enters `READY_FOR_HANDOFF`:

- `currentWorker` becomes empty
- `currentRole` becomes empty
- `currentLocation` remains unchanged
- the completed worker and role remain available through assignment and transition history
- the Product remains physically associated with its last known location until the next receive or transfer action
- the Product is waiting for the next authorized worker or transfer action

If the same worker who currently holds an `IN_PROGRESS` Product scans it again, the system must show a confirmation popup asking whether to finish the current work.

Available actions:

- `Yes`
- `No`

Choosing `No` makes no changes.

Choosing `Yes` performs the normal finish-work operation:

- closes the active ProductAssignment
- records completion time
- sets `currentWorker = null`
- sets `currentRole = null`
- keeps `currentLocation` unchanged
- sets `status = READY_FOR_HANDOFF`
- appends a ProductTransition
- creates the required audit record

The repeated scan itself must never finish work without explicit confirmation.

### Next receive

The next authorized worker can receive the Product by scanning it.

For a Product in `READY_FOR_HANDOFF`, a valid receive scan must:

- validate that the Product can be received
- validate the worker and active role
- create a new ProductAssignment
- set `currentWorker` to the receiving worker
- set `currentRole` to the worker's active role
- update `currentLocation` to the location associated with the new handling context
- append a ProductTransition
- transition the Product back to `IN_PROGRESS`

Confirmed transition:

`READY_FOR_HANDOFF -> IN_PROGRESS`

### Product completion

A Product is not completed automatically by barcode scanning.

Completion requires an explicit action by an authorized user.

Confirmed transition:

`READY_FOR_HANDOFF -> COMPLETED`

When completion succeeds:

- the Product status becomes `COMPLETED`
- `currentWorker` remains empty
- `currentRole` remains empty
- `currentLocation` remains the last known location
- completion time is recorded
- a ProductTransition is appended
- an audit record is created

A completed Product is not received silently through the normal scan flow.

If a worker scans a `COMPLETED` Product from the same department in which the Product was last handled before completion, the system must show a warning instead of immediately changing state.

The warning must indicate who marked the Product as completed and provide two actions:

- `Return to process`
- `Cancel`

Choosing `Cancel` leaves the Product unchanged.


If a worker scans a `COMPLETED` Product from a different department than the Product's last pre-completion department, the Product moves into the scanning worker's department and returns to active work.

When this succeeds:

- `status` becomes `IN_PROGRESS`
- a new ProductAssignment is created for the scanning worker
- `currentWorker` becomes the scanning worker
- `currentRole` becomes the worker's active role
- `currentLocation` becomes the scanning worker's department/location
- a ProductTransition is appended
- an audit record is created
- all previous history remains preserved

Choosing `Return to process` must be treated as an explicit reopen/rework action, subject to server-side authorization and audit requirements.

When `Return to process` succeeds:

- `status` becomes `IN_PROGRESS`
- a new ProductAssignment is created for the worker who scanned
- `currentWorker` becomes that worker
- `currentRole` becomes the worker's active role
- `currentLocation` becomes the worker's current department/location
- a ProductTransition is appended
- an audit record is created
- all previous completion and work history remains unchanged


### Scan while another worker is handling the Product

If a worker scans a Product whose status is `IN_PROGRESS` and the Product is currently assigned to another worker, the system must not transfer responsibility silently.

The system displays a warning such as:

`The Product is currently in process with <worker>.`

The scanning worker receives two actions:

- `The Product is now with me`
- `Cancel`

Choosing `Cancel` makes no changes.

Choosing `The Product is now with me` transfers active responsibility to the scanning worker.

When the transfer succeeds:

- the previous ProductAssignment is closed
- a new ProductAssignment is created for the scanning worker
- `currentWorker` becomes the scanning worker
- `currentRole` becomes the scanning worker's active role
- `currentLocation` becomes the scanning worker's current department/location
- `status` remains `IN_PROGRESS`
- a ProductTransition is appended
- an audit record is created
- the previous worker and assignment remain preserved in history

## 7. Product lifecycle

Initial lifecycle concepts:

- `CREATED`
- `IN_PROGRESS`
- `READY_FOR_HANDOFF`
- `COMPLETED`
- `CANCELLED`
- `TRASHED`

Status does not encode current worker, role, or location.

Those are independent domain dimensions.

## 8. Product information

The first jewelry-factory implementation may include Product attributes such as:

- jewelry type
- model
- size
- gold type
- gold color
- expected or declared gold weight
- center diamond information
- small diamond information
- production notes
- internal notes

Jewelry-specific fields must remain outside the generic workflow engine.

## 9. Orders

A ProductionOrder may contain multiple Products.

Requirements:

- each physical Product is tracked individually
- each Product receives its own barcode
- Products in the same Order may be at different production states
- Product tracking must not depend on all Products in an Order moving together

## 10. Product tracking

The system must preserve:

- current status
- current worker
- current role
- current location
- current target or operational timing when configured
- active issue indicator
- complete Product transition history
- complete responsibility history

Historical records are append-only.

## 11. Locations

Products may exist at:

- worker-associated production areas
- departments
- safe
- storage
- waiting areas
- external contractors
- other configured factory locations

Locations do not require their own barcode in the MVP.

Transfers to non-worker locations require explicit permission.

## 12. Issues

Authorized users can report Product issues.

Initial issue lifecycle:

`OPEN -> RESOLVED`

Requirements:

- issues are visible to management
- active issues are clearly indicated
- resolved issues remain in history
- an issue does not automatically stop Product movement unless a future rule explicitly requires it

## 13. Material and weight tracking

The system must support material weight events.

Initial event types:

- `EXPECTED`
- `ISSUED`
- `FINAL`
- `RETURNED`
- `APPROVED_LOSS`

Requirements:

- events are append-only
- corrections create new records
- grams use decimal precision
- reports may later aggregate loss by Product, Order, worker, role, department, model, and date

## 14. Urgency and delay

The system must support:

- manual urgent indication
- target date or time where applicable
- delayed indication
- filtering by operational urgency

Exact automatic urgency rules remain configurable.

## 15. Manager Product inspection

An authorized manager can inspect a specific Product from mobile or desktop.

The view should provide, according to permission:

- Product identifiers
- Order
- customer
- current status
- current location
- current worker
- current role
- operational dates
- active issues
- material/weight history
- full Product history

## 16. Permissions

Authorization is capability-based.

Example capabilities:

- products.create
- products.read
- products.update
- products.complete
- products.reopen
- products.cancel
- barcodes.print
- barcodes.reprint
- scans.perform
- scans.undo_own
- scans.undo_any
- locations.transfer
- issues.create
- issues.resolve
- weights.read
- weights.create
- users.manage
- roles.manage
- permissions.manage
- audit.read
- reports.export

All protected operations require server-side authorization.

## 17. Multi-tenancy

Each factory is an `Organization`.

Requirements:

- strict tenant isolation
- tenant-scoped reads and writes
- organization membership validation
- server-side authorization
- tenant isolation tests

MVP onboarding:

- System Admin creates the Organization
- System Admin creates or onboards the first Factory Admin

## 18. Authentication

Requirements:

- personal user accounts
- no shared PIN-based worker identity
- manager-created worker accounts for the initial factory
- workers can remain signed in on their own phones
- authorized administrators can reset worker credentials

## 19. Languages

The UI must be internationalized from the beginning.

Initial target languages:

- Hebrew
- English
- Russian

Requirements:

- UI text comes from translation resources
- language is selected by user preference
- Hebrew is the initial default language

## 20. Audit

Important actions must be auditable.

Examples:

- Product creation
- Product edits
- barcode print and reprint
- scan transitions
- manual status changes
- transfers
- issue creation and resolution
- weight corrections
- permission or role changes
- user administration

Audit history must be append-only.

## 21. Concurrency and reliability

Scan mutations must be:

- atomic
- idempotent
- concurrency-safe

The system must prevent:

- duplicate transitions caused by request retries
- double assignment caused by concurrent scans
- partial updates where status changes but history or responsibility does not
- cross-tenant Product access

## 22. MVP interface

Worker experience:

- mobile-first
- fast login/session reuse
- minimal typing
- barcode scanning from phone camera
- clear receive and finish confirmation
- clear success and error feedback

Manager experience:

- mobile and desktop
- Product search and scan
- Product inspection
- operational filters
- history
- user and permission management according to role

## 23. MVP exclusions

Not required for the first MVP:

- microservices
- Kubernetes
- product photos
- shipping module
- AI features
- location barcodes
- advanced workflow analytics
- speculative integrations without a current business requirement

## 24. MVP success criteria

The MVP is successful when the factory can reliably:

1. create a Product
2. generate and print its barcode
3. scan it from a worker phone
4. assign responsibility correctly
5. track current status, worker, role, and location
6. complete and hand off production work
7. preserve immutable Product history
8. prevent invalid or duplicate scan transitions
9. enforce permissions
10. enforce tenant isolation
11. inspect a Product and understand what happened to it

## Product cancellation and trash

An authorized user may cancel a Product from an active lifecycle state.

When cancellation succeeds:

- `status = CANCELLED`
- any active ProductAssignment is closed
- `currentWorker = null`
- `currentRole = null`
- `currentLocation` remains the last known location
- the Product is excluded from normal worker receive scans
- the Product remains searchable to authorized users
- all history, barcode data, issues, weights, and audit records remain preserved
- a ProductTransition and audit record are created

A cancelled Product may be restored by an authorized user.

Confirmed restore transition:

`CANCELLED -> READY_FOR_HANDOFF`

When restored:

- `currentWorker = null`
- `currentRole = null`
- `currentLocation` remains the last known location
- the Product becomes available for a future valid receive scan
- a ProductTransition and audit record are created

A Product may be moved from `CANCELLED` to `TRASHED`.

`TRASHED` means the Product is logically removed from normal operational views but is not yet physically deleted from the database.

Rules for `TRASHED`:

- it cannot be received through the normal scan flow
- it is excluded from normal operational queues and searches
- its historical records remain preserved
- permanent deletion, if ever allowed, is governed by a separate retention policy

## Workflow and active role

FactoryFlow supports configurable production workflows.

A WorkflowTemplate defines reusable production stages and allowed progression rules.

A Product receives a preserved WorkflowSnapshot so later template edits do not silently change Products already in production.

Workflow progression is not strictly forward-only.

The system must support:

- normal forward movement
- backward movement
- rework
- repeated visits to the same stage when allowed by the workflow

Workers may be associated with more than one operational role.

Before scanning and receiving Products, a worker selects an `activeRole` from the home screen.

The selected `activeRole` represents the role the worker is currently performing.

When a worker scans or receives a Product:

- the server validates that the worker is allowed to use the selected role
- the selected role is recorded on the ProductAssignment
- the selected role is recorded in Product history
- the selected role determines the production stage used for the handling action

If a worker has only one available operational role, the UI may select it automatically.

If a worker has multiple roles, the worker chooses the active role from the home screen before handling Products.

The configured workflow is advisory for worker receiving and must not block a valid scan solely because the worker's selected `activeRole` is not the expected next role or stage.

If the scan is otherwise valid and authorized:

- the Product may still be received
- the worker's selected `activeRole` is used
- the corresponding stage is recorded
- history must reflect the actual path the Product took

## Access roles vs production roles

FactoryFlow separates authorization roles from production roles.

`AccessRole` controls what a user is allowed to do in the system.

Examples:

- Factory Admin
- Production Manager
- Worker
- Quality Control
- Viewer

`ProductionRole` describes the production function a worker is performing.

Examples:

- Polisher
- Stone Setter
- Cleaner
- Quality Inspector

A worker may have multiple ProductionRoles and selects one active ProductionRole from the home screen.

The active ProductionRole is recorded on ProductAssignments and ProductTransitions.

AccessRole and ProductionRole must not be stored as the same concept.
