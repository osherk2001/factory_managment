# FactoryFlow operational behavior

## Scope

The September 2026 completion request authorizes the remaining MVP phases.
The stack, modular monolith, tenant model, and existing lifecycle transitions
remain in place. Unconfirmed order lifecycle, undo, automatic loss approval,
retention/deletion, and printer hardware policies remain out of scope.

## Issues and weights

- Issues have the documented OPEN → RESOLVED lifecycle. Resolution records the
  actor, time, and optional resolution text, and preserves the original report.
  A conditional update ensures only one concurrent resolution succeeds.
- Issue creation and resolution require their respective permissions. Reading
  issue descriptions and counts requires issues.read.
- Weight entries use PostgreSQL Decimal(10,3). The API accepts decimal strings
  with up to three fractional digits, never JavaScript floating-point amounts.
- EXPECTED, ISSUED, FINAL, RETURNED, and APPROVED_LOSS are positive additive
  entries. A CORRECTION is a signed nonzero delta against an original entry
  on the same tenant and Product, with a required reason. A correction cannot
  target another correction. Historical measurements are never overwritten.
- Corrections contribute to the original entry's category and preserve its
  employee, production-role, and location attribution. The correcting actor
  and original event time remain separate.
- Issued minus expected is an expected variance. Issued minus final, returned,
  and approved loss is **unaccounted material**, not automatically approved
  loss or employee liability. These are ledger totals, not a replacement or
  latest-measurement model. A factory needing baseline replacement semantics
  must agree that rule before using reports for accounting.
- Creation, resolution, weights, corrections, print requests, and Product
  operation changes use transactionally stored idempotency results.
- All writes audit their tenant and actor. Normal scans do not stop because
  an issue exists.

## Manager views and reporting

/app/products provides tenant-scoped serial, exact barcode, order and customer
search; status, worker, role, location, urgent, open issue, and overdue filters.
TRASHED Products are excluded from ordinary lists and reports. An authorized
direct Product inspection retains their history.

Overdue means an active Product (CREATED, IN_PROGRESS, READY_FOR_HANDOFF)
has targetAt earlier than the current instant. Manual urgency is independent.
Operational dates are UTC instants; date-only target input represents midnight
UTC, consistent with Product creation. No automatic urgency escalation is added.

Product inspection includes customer/order/type, current responsibility and
location, issue and material information according to permission, lifecycle
controls, and paginated transition and assignment histories (50 per page).

Authorized Product updates can change urgency and target date. Location
transfers are limited to unassigned CREATED or READY_FOR_HANDOFF Products:
finish current work before moving a Product to a storage or other configured
location. A transfer preserves status and appends a MANUAL_TRANSFER event.
Version compare-and-set, idempotency, tenant checks, and auditing apply.

Reports require reports.export and products.read; material reports also require
weights.read. Exports contain at most 10,000 Products and refuse larger
requests, rather than silently truncating. Date filters select Products by
creation date in UTC; material totals cover those Products' complete ledgers.
CSV cells are quoted and spreadsheet formula prefixes are neutralized. Every
successful export records its kind, filters, actor, and row count in audit.

## Barcode hardware boundary

The first printable label uses QR Code, with the existing non-guessable ff_
payload. qrcode generates the label; @zxing/browser decodes camera frames.
They are isolated adapters; hardware approval can replace symbology without
changing barcode identity or scan domain operations. ZXing 0.1.5 is selected
for the project's Node 22 compatibility.

Camera access starts only after the worker requests it. The browser must have
camera permission and a secure context (HTTPS, or localhost in development).
A decoded value enters the existing scan operation. The scanner stops after
one decode, on cancellation, and on unmount. Manual barcode input remains
available if camera access is unavailable.

Preparing a label is an explicit mutation requiring barcodes.print for the
first request and barcodes.reprint subsequently. Concurrent first-print
requests are serialized. Audit records describe **print requests**, since a
web browser cannot prove that paper emerged from a physical printer. Retries
with the same key replay the first label without another audit event.

## Administration and identity

Platform System Admin onboarding creates an Organization and a distinct first
Factory Admin in one transaction. The platform actor is recorded in a
platform audit event, separate from tenant memberships.

Factory setup creates users, access roles, departments, locations, production
roles, product types, customers, and order groupings. Orders start with the
existing OPEN convention; no order-state transition rules are invented.
Creating product types, customers and order groupings uses products.create
because they are current Product-creation reference configuration.

Users and their assigned access roles require users.manage and
access_roles.manage. Role permission editing also requires permissions.manage.
An administrator cannot grant, remove, or reset credentials for privileges
they do not hold. Updating one's own role assignment or an access role
assigned to oneself is blocked to avoid accidental self-lockout.

Password reset requires users.manage, rechecks target tenant membership and
role authority, and refuses platform identities and identities shared by
multiple factories. It increments User.sessionVersion; older sessions are
rejected by protected operations. Credential material is absent from audit
and application logs. Platform bootstrap password resets also revoke sessions.

Production-role assignment requires production_roles.manage and users.manage,
validates tenant-local active roles/locations, and acquires the same employee
lock used by worker scans. It changes future handling context only.

Language is a persisted user preference (Hebrew default; English and Russian
supported), with a cookie for signed-out language selection. A user with
multiple memberships can choose a tenant, but the preference is validated
against current active memberships on every operation.

