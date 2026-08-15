# WORKFLOW_ENGINE.md

## 1. Purpose

This document defines the workflow model used by FactoryFlow.

The workflow engine must support real factory production without forcing every Product through a rigid linear sequence.

## 2. Core concepts

### WorkflowTemplate

A reusable workflow configuration.

It defines:

- production stages
- stage order or allowed paths
- stage metadata
- allowed movement rules

A WorkflowTemplate is configuration and may change over time.

### WorkflowSnapshot

A preserved workflow configuration assigned to a Product or production instance.

Purpose:

- preserve the effective workflow used by the Product
- prevent later template edits from silently changing Products already in production
- make historical behavior understandable

### ProductionStage

Represents one production step or handling stage.

A stage is a generic domain concept and must not be hard-coded to jewelry terminology.

Example stages for one factory may include:

- Casting
- Cleaning
- Stone Setting
- Polishing
- Quality Control

Other factories may define completely different stages.

## 3. Movement model

Workflow movement is not strictly linear.

The engine must support:

- forward movement
- backward movement
- rework
- repeated visits to the same stage
- movement between different worker roles
- non-blocking deviations from the expected next stage

Every actual movement is recorded historically.

A ProductTransition must preserve enough context to understand:

- previous stage
- next stage
- previous worker
- next worker
- previous role
- next role
- previous location
- next location
- actor
- timestamp
- reason or context when required

## 4. Worker active production role

A worker may be allowed to perform more than one operational role.

Before handling Products, the worker selects an `activeProductionRole` from the home screen.

Rules:

- the selected role is part of the worker's current working context
- the selected role remains active until changed
- the server validates that the worker is authorized for the role
- if the worker has one role, the UI may select it automatically
- if the worker has multiple roles, the UI provides explicit role selection
- every new ProductAssignment records the active production role
- relevant ProductTransitions record the active production role
- historical assignments never change when the worker later selects another role

## 5. Role to stage resolution

The worker's selected `activeProductionRole` determines the production stage used for the current handling action.

A worker may have multiple authorized operational roles.

Example:

```text
Worker
├── POLISHER
└── STONE_SETTER
```

If the worker selects `POLISHER`, new ProductAssignments and relevant ProductTransitions are recorded under the polishing stage.

If the worker later selects `STONE_SETTER`, future handling actions are recorded under the stone-setting stage.

Rules:

- worker identity does not determine the stage by itself
- the selected active production role determines the stage
- one worker may have multiple roles
- only one active production role is used for a single handling action
- changing active production role affects future actions only
- historical assignments retain the role and stage that were active when they were created


## 6. Workflow enforcement policy

The workflow is used to describe and track the expected production path, but it does not block an otherwise valid worker receive scan solely because the worker's active production role is not the expected next stage.

Example:

```text
Expected next stage: STONE_SETTING
Worker activeProductionRole: POLISHER
```

If the worker is authorized to act as `POLISHER` and the Product can otherwise be received, the scan is allowed.

The system records the actual handling stage as `POLISHER`.

The actual Product path must remain visible in ProductTransition history.

This policy keeps FactoryFlow focused on tracking real factory movement instead of forcing workers to follow a rigid digital sequence.


## 7. Product workflow history

Workflow history is append-only.

A Product may visit the same stage multiple times.

Therefore, the current stage must not be inferred only from a unique stage row.

History must preserve each visit independently.

Example:

```text
Stage A
  ↓
Stage B
  ↓
Stage C
  ↓ rework
Stage B
  ↓
Stage C
```

Both visits to Stage B and Stage C must remain visible.

## 8. Template changes

Changing a WorkflowTemplate must not rewrite the historical path of Products already in production.

Products already assigned to a workflow use their preserved WorkflowSnapshot.

A future product may receive the newer template version.

## 9. Open decisions

The following decisions are not finalized yet:

- whether a Product has one explicit `currentStageId`
- how the next allowed stage is calculated
- whether managers can override stage restrictions
- whether stage transitions require explicit reasons for backward movement
- how stage completion interacts with Product status
