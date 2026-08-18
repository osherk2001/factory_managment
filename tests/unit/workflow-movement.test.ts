import { describe, expect, it } from "vitest";

import {
  buildWorkflowTransitionMetadata,
  classifyWorkflowMovement,
  mergeWorkflowTransitionMetadata,
} from "../../src/modules/workflows/workflow-movement";

const first = { id: "stage-1", position: 1 };
const second = { id: "stage-2", position: 2 };
const third = { id: "stage-3", position: 3 };

describe("workflow movement classification", () => {
  it.each([
    [null, first, "INITIAL"],
    [first, second, "FORWARD"],
    [first, third, "FORWARD"],
    [third, first, "BACKWARD"],
    [second, second, "REPEAT"],
    [second, null, "UNMAPPED"],
  ] as const)("classifies %s to %s as %s", (current, actual, expected) => {
    expect(classifyWorkflowMovement(current, actual)).toBe(expected);
  });

  it("marks skipped, backward, repeat, and unmapped work accurately", () => {
    expect(
      buildWorkflowTransitionMetadata({
        snapshotId: "snapshot",
        currentStage: first,
        expectedStage: second,
        actualStage: third,
        actualProductionRoleId: "role",
      }),
    ).toMatchObject({
      movement: "FORWARD",
      deviation: true,
      isRework: false,
      expectedStageId: second.id,
      actualStageId: third.id,
    });

    expect(
      buildWorkflowTransitionMetadata({
        snapshotId: "snapshot",
        currentStage: second,
        expectedStage: third,
        actualStage: first,
        actualProductionRoleId: "role",
      }),
    ).toMatchObject({ movement: "BACKWARD", deviation: true, isRework: true });

    expect(
      buildWorkflowTransitionMetadata({
        snapshotId: "snapshot",
        currentStage: second,
        expectedStage: third,
        actualStage: second,
        actualProductionRoleId: "role",
      }),
    ).toMatchObject({ movement: "REPEAT", deviation: true, isRework: true });

    expect(
      buildWorkflowTransitionMetadata({
        snapshotId: "snapshot",
        currentStage: second,
        expectedStage: third,
        actualStage: null,
        actualProductionRoleId: "role-unmapped",
      }),
    ).toMatchObject({
      movement: "UNMAPPED",
      deviation: true,
      isRework: false,
      actualProductionRoleId: "role-unmapped",
    });
  });

  it("merges workflow metadata without replacing existing metadata", () => {
    expect(
      mergeWorkflowTransitionMetadata(
        { source: "scanner", nested: { retained: true } },
        buildWorkflowTransitionMetadata({
          snapshotId: "snapshot",
          currentStage: null,
          expectedStage: first,
          actualStage: first,
          actualProductionRoleId: "role",
        }),
      ),
    ).toMatchObject({
      source: "scanner",
      nested: { retained: true },
      workflow: { schemaVersion: 1, movement: "INITIAL", deviation: false },
    });
  });
});
