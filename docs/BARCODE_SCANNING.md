# BARCODE_SCANNING.md

## 1. Purpose

Barcode scanning is the primary mechanism for workers to receive and transfer physical Products.

Scanning is a business operation, not only a lookup.

## 2. Barcode identity

Every Product receives one unique barcode value.

Requirements:

- globally unique within FactoryFlow
- non-guessable
- does not expose sequential database IDs
- resolves to exactly one Product
- printable and reprintable with authorization

Exact symbology remains replaceable until real printer and phone-camera testing is complete.

Phase 5 establishes the Product barcode identity. Phase 7 accepts the
decoded barcode string at a server action boundary; it does not include a
camera library or make the browser camera part of the business contract. New
Products receive a globally unique `ff_` value generated from
cryptographically secure random bytes; the value is not a Product ID or
serial number.

## 3. First scan

For a Product in `CREATED`:

```text
CREATED
↓ valid worker scan
IN_PROGRESS
```

The operation:

- verifies user
- verifies Organization
- verifies `scans.perform`
- verifies selected active ProductionRole
- resolves Product
- creates ProductAssignment
- sets current worker
- sets current ProductionRole
- sets current location
- records workflow stage
- appends ProductTransition

When the Product has a WorkflowSnapshot, receive resolves the active
ProductionRole to a snapshot stage inside the scan transaction. One match is
automatic, multiple matches require a read-only explicit selection, and no
match records an `UNMAPPED` deviation without blocking the otherwise valid
scan. Takeover uses the same resolver. The selected stage is part of the
idempotency request hash.

The scan resolves the worker's active role assignment, including its
role-specific handling Location. The barcode lookup is scoped by the trusted
Organization; an unknown barcode and a barcode from another tenant have the
same safe result.

## 4. READY_FOR_HANDOFF scan

For a Product in `READY_FOR_HANDOFF`:

```text
READY_FOR_HANDOFF
↓ worker scan
IN_PROGRESS
```

The receiving worker gets a new ProductAssignment.

## 5. Same-worker rescan

If Product is `IN_PROGRESS` and assigned to the scanning worker:

Show confirmation:

```text
Finish work?
[Yes] [No]
```

`No`:

- no changes

The scan opens a confirmation state. The `Yes` mutation now calls the same
Phase 8 finish-work service used by the worker personal work area.

`Yes` behavior:

- closes active ProductAssignment
- records the finish transition without setting `completedAt`
- clears current worker
- clears current ProductionRole
- preserves current location
- changes status to `READY_FOR_HANDOFF`
- appends ProductTransition
- creates audit record where required

## 6. Scan by another worker

If Product is `IN_PROGRESS` with another worker:

Show:

```text
Product is currently in process with <worker>.
[The Product is now with me] [Cancel]
```

Cancel:

- no changes

Takeover:

- closes previous ProductAssignment
- creates new ProductAssignment
- keeps `IN_PROGRESS`
- updates worker
- updates ProductionRole
- updates location
- appends ProductTransition
- creates audit record

## 7. Scanning a completed Product in same previous department

The scan reports whether the scanning worker's handling Location is in the same
department, another department, or an unknown context. The classification is
read-only. An explicit return-to-process action is available only when the
server confirms `products.reopen` and `scans.perform`.

Show warning:

```text
Product was marked completed by <user>.
[Return to process] [Cancel]
```

Cancel:

- no changes

Phase 8 return-to-process behavior:

- creates new ProductAssignment
- status becomes `IN_PROGRESS`
- current worker becomes scanner
- current ProductionRole becomes selected active role
- current location becomes current department/location
- ProductTransition appended
- AuditLog created

The explicit return action is the same authorized mutation for same-department,
other-department, and unknown-context prompts. A completed scan never
automatically changes Product responsibility.

## 8. Scanning a completed Product in another department

The other-department scan also performs read-only classification. The Product
moves only after the worker explicitly confirms return-to-process and the
server validates the lifecycle permissions and current production context.

## 9. Cancelled and trashed Products

`CANCELLED` and `TRASHED` Products are not received through normal worker scanning.

Restoration is a separate authorized operation.

## 10. Idempotency

Every state-changing scan request must carry or generate an idempotency key.

Repeated submission of the same request must return the original result or a safe equivalent without creating duplicate history.

## 11. Concurrency

Two workers may scan the same physical barcode almost simultaneously.

The server must:

- start a transaction
- reload/revalidate Product state
- protect the Product row or use equivalent concurrency control
- enforce one active ProductAssignment
- reject or redirect stale actions safely

The database must enforce that a Product cannot have two active assignments.

Receive and takeover use the Product `version` as a compare-and-set token,
reserve a tenant/user-scoped idempotency key inside the transaction, and
acquire the worker's `EmployeeProfile` row lock before re-resolving the
effective active ProductionRole and its handling Location. The pre-transaction
worker context is not authoritative for Product mutation.

The EmployeeProfile row lock serializes worker ProductionRole selection against
state-changing responsibility mutations. Product `version` compare-and-set
remains the separate guard for competing Product responsibility changes, and
the existing one-active-assignment database constraint remains a second
integrity defense.

A takeover confirmation with a stale Product version returns `SCAN_CONFLICT`,
because the Product state changed after the warning was shown. Genuine domain
invalid takeover states continue to return `TAKEOVER_NOT_ALLOWED`.

## 12. Client behavior

The client must not assume success before server confirmation.

The UI should clearly display:

- Product identity
- current worker when relevant
- current ProductionRole
- current location
- warning state
- action buttons
- success result
- conflict result

## 13. Camera scanning

Worker scanning is mobile-first.

The implementation should support phone camera scanning without requiring dedicated scanner hardware.

The exact browser scanning library must be selected only after a small hardware/browser proof of concept.

## 14. Printing

Print operations require permission.

Reprints are audited.

The first MVP may print only the barcode itself.

Printer-specific commands must remain isolated behind a printing abstraction so printer hardware can change later.
