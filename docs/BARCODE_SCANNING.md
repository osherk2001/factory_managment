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

`Yes`:

- closes active ProductAssignment
- records completion time
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

Show warning:

```text
Product was marked completed by <user>.
[Return to process] [Cancel]
```

Cancel:

- no changes

Return to process:

- creates new ProductAssignment
- status becomes `IN_PROGRESS`
- current worker becomes scanner
- current ProductionRole becomes selected active role
- current location becomes current department/location
- ProductTransition appended
- AuditLog created

## 8. Scanning a completed Product in another department

The Product moves to the scanning worker's department and returns to active work.

The operation:

- creates new ProductAssignment
- sets `IN_PROGRESS`
- updates worker
- updates ProductionRole
- updates location
- appends ProductTransition
- creates AuditLog

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
