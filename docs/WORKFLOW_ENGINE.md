# Workflow engine

## Purpose

FactoryFlow records both the configured production path and the path that a
Product actually takes. Workflow is advisory: an otherwise valid handling
action is not blocked merely because it differs from the expected next stage.

## Immutable configuration

A `WorkflowTemplate` is one immutable, tenant-owned version of a named
workflow. A template contains one or more ordered `WorkflowTemplateStage`
records. Stage codes and positive positions must be unique within a version.
A stage may map to one active `ProductionRole` in the same Organization or may
remain unmapped.

Templates are never edited or deleted through the application service. A
change creates the next integer version under the same name. Creating or
activating a version deactivates the other active versions with that tenant and
name. Deactivation prevents future Product selection but does not affect
existing Products.

Management requires `workflows.manage`. Product creation lists active versions
for the authenticated tenant only.

## Product snapshots

Product creation may select one active WorkflowTemplate. In the same database
transaction as Product, barcode, creation history, audit, and idempotency
writes, FactoryFlow creates:

- one `WorkflowSnapshot` linked to the Product and source version;
- copied `WorkflowSnapshotStage` rows containing stage code, name, position,
  source stage, and ProductionRole mapping.

Later template versions and activation changes cannot alter this snapshot.
Products may also be created without a workflow; their existing lifecycle and
idempotency behavior remains unchanged.

## Expected stage

The expected stage is deliberately simple in Phase 9:

- before any mapped stage, the lowest-position snapshot stage is expected;
- after a current stage, the next greater position is expected;
- after the final stage, no next stage is expected.

This expectation describes a linear reference path. It does not prohibit
forward skips, backward work, repeats, or work by an unmapped role.

## ProductionRole-to-stage resolution

Receive, takeover, and return-to-process resolve the active ProductionRole
against the Product snapshot inside the existing mutation transaction.

- No snapshot: no stage is recorded and existing null behavior is preserved.
- No matching stage: the action succeeds, the new assignment stage is null,
  and `Product.currentStageId` is preserved. History records `UNMAPPED`.
- One matching stage: it is selected automatically.
- Multiple matching stages: no Product, assignment, transition, audit, or
  idempotency write occurs. The caller receives
  `WORKFLOW_STAGE_SELECTION_REQUIRED` with safe candidate DTOs.

An explicit selection must be a stage candidate from the same tenant, Product,
snapshot, and active ProductionRole. Foreign, stale, arbitrary, or differently
mapped IDs fail as `WORKFLOW_STAGE_NOT_AVAILABLE` without revealing whether a
foreign record exists. The selected stage participates in the idempotency
request hash.

## Movement classification

Each mapped or unmapped handling action is classified as:

- `INITIAL`: first mapped stage;
- `FORWARD`: a greater stage position, including allowed skips;
- `BACKWARD`: a lower stage position;
- `REPEAT`: the same stage again;
- `UNMAPPED`: the active role has no snapshot-stage mapping.

Backward and repeat movements are rework. A movement is a deviation when the
actual stage differs from the expected stage. Unmapped work is always a
deviation. Forward skips remain allowed and are recorded as deviations.

## Transition metadata and actual path

Receive, takeover, and return-to-process merge the following object under
`ProductTransition.metadata.workflow`:

```json
{
  "schemaVersion": 1,
  "snapshotId": "uuid",
  "movement": "FORWARD",
  "expectedStageId": "uuid-or-null",
  "actualStageId": "uuid-or-null",
  "deviation": false,
  "isRework": false
}
```

`UNMAPPED` metadata additionally records `actualProductionRoleId`. Existing
transition metadata is retained when workflow metadata is added.

The append-only `ProductTransition` sequence is the actual path. It is not
reconstructed by rewriting snapshot stages or prior assignments.

## Lifecycle boundaries

Receive, takeover, and return-to-process resolve a stage. Finish does not
resolve again: the active assignment's `workflowStageId` remains authoritative
for that responsibility period, while `Product.currentStageId` is preserved
and the Finish transition records stage-to-same-stage. Complete, cancel,
restore, and trash also preserve the current stage.

## Concurrency and idempotency

Workflow resolution runs after authoritative worker role/location resolution
and under the existing EmployeeProfile mutex. Product version compare-and-set
and the one-active-assignment database constraint remain Product-level guards.
Concurrent same-key requests replay the committed safe result. Ambiguous
read-only results reserve no idempotency key, so a later explicit selection can
use a fresh key.

## Current limitations

Phase 9 does not add branching graphs, conditional edges, manager overrides,
required backward-movement reasons, workflow analytics, issues, weights, or
automatic location inference. Those rules remain unresolved rather than being
invented.
