import { describe, expect, it } from "vitest";
import { computeActionProgress } from "./actionCenterProgress";


describe("computeActionProgress", () => {
  it("calculates percentage accurately based on non-dismissed actions", () => {
    expect(
      computeActionProgress({
        total: 10,
        doneCount: 5,
        dismissedCount: 0,
      }),
    ).toEqual({
      actionable: 10,
      percentage: 50,
    });

    expect(
      computeActionProgress({
        total: 12,
        doneCount: 2,
        dismissedCount: 2,
      }),
    ).toEqual({
      actionable: 10,
      percentage: 20,
    });
  });

  it("handles zero actions gracefully", () => {
    expect(
      computeActionProgress({
        total: 0,
        doneCount: 0,
        dismissedCount: 0,
      }),
    ).toEqual({
      actionable: 0,
      percentage: 0,
    });
  });

  it("handles all dismissed actions without dividing by zero", () => {
    expect(
      computeActionProgress({
        total: 5,
        doneCount: 0,
        dismissedCount: 5,
      }),
    ).toEqual({
      actionable: 0,
      percentage: 0,
    });
  });

  it("clamps percentage to 100", () => {
    expect(
      computeActionProgress({
        total: 4,
        doneCount: 4,
        dismissedCount: 0,
      }),
    ).toEqual({
      actionable: 4,
      percentage: 100,
    });
  });
});
