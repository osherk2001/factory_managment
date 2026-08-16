# AUTHORIZATION.md

## 1. Purpose

FactoryFlow uses server-side capability-based authorization.

Authentication identifies the user.

Authorization decides whether that authenticated user may perform an action.

## 2. Core concepts

### Membership

Connects a User to an Organization.

A valid Membership is required for tenant access.

### AccessRole

Authorization role.

Examples:

- Factory Admin
- Production Manager
- Worker
- Quality Control
- Viewer

### Permission

One allowed capability.

Examples:

```text
products.create
products.read
products.update
products.complete
products.reopen
products.cancel
products.trash

barcodes.print
barcodes.reprint

scans.perform
scans.takeover

locations.transfer

issues.create
issues.read
issues.resolve

weights.read
weights.create
weights.correct

users.manage
access_roles.manage
permissions.manage

audit.read
reports.export
```

### ProductionRole

ProductionRole is not an authorization role.

Examples:

- Polisher
- Stone Setter

ProductionRole describes what production function an employee is performing.

AccessRole and ProductionRole must remain separate.

## 3. Authorization flow

For every protected operation:

```text
authenticated user
↓
resolve organization membership
↓
verify membership active
↓
resolve permissions
↓
verify required permission
↓
verify resource belongs to organization
↓
execute operation
```

## 4. Never trust the client

Do not authorize based on:

- hidden buttons
- route visibility
- browser-provided organizationId
- browser-provided workerId
- browser-provided permission list

The server resolves trusted identity and authorization context.

## 5. Initial permission examples

### Product

```text
products.create
products.read
products.update
products.complete
products.reopen
products.cancel
products.restore
products.trash
```

### Barcode

```text
barcodes.print
barcodes.reprint
```

### Scanning

```text
scans.perform
scans.takeover
```

### Locations

```text
locations.transfer
```

### Issues

```text
issues.create
issues.read
issues.resolve
```

### Weights

```text
weights.read
weights.create
weights.correct
```

### Administration

```text
users.manage
access_roles.manage
permissions.manage
production_roles.manage
locations.manage
workflows.manage
```

### Audit and reporting

```text
audit.read
reports.export
```

## 6. Worker rules

A worker may:

- perform scan actions only with `scans.perform`
- use only ProductionRoles assigned to the employee
- finish only an active assignment they currently own unless elevated permission exists
- take over another worker's Product only through the explicit takeover flow

## 7. Completion rules

Completing a Product requires an explicit permission.

Recommended:

```text
products.complete
```

Normal worker scanning alone does not imply completion permission.

## 8. Reopen and return-to-process

Returning a completed Product to production is a state-changing operation.

The exact permission may initially be:

```text
products.reopen
```

If product policy later allows regular workers to reopen through specific scan flows, the server must still authorize that action explicitly.

## 9. Cancellation and trash

Recommended permissions:

```text
products.cancel
products.restore
products.trash
```

These should not be automatically granted to ordinary workers.

## 10. System administrator

System-level administration remains separate from tenant-level administration.

For the MVP, platform capability is represented explicitly by
`User.isSystemAdmin`, which defaults to `false`. It is a platform-level flag,
not a tenant `AccessRole`, and it must not be seeded onto normal factory
users. This simple representation may later evolve into a richer platform
authorization model.

System Admin may:

- create Organizations
- onboard first Factory Admin
- perform explicitly approved platform administration

System Admin access must not be implemented as a normal tenant role.

## 11. User identity uniqueness

Before authentication is implemented, the database establishes the MVP
identity rule: non-null `User.email` and non-null `User.username` are globally
unique. Multiple `NULL` values remain allowed by PostgreSQL. Usernames are not
organization-scoped in this MVP; that choice may be revisited if tenant-
specific usernames become necessary.

Tenant actions must also retain the actor's Organization Membership context.
The User identity alone is not sufficient to prove tenant authority.

## 12. Default-deny rule

If permission cannot be proven, deny the operation.

Do not infer permission from job title text.

## 13. Audit

Sensitive authorization and administration actions must be audited.

Examples:

- role assignment
- permission modification
- user creation
- password reset
- product completion
- product reopen
- cancellation
- trash
- manual transfer
