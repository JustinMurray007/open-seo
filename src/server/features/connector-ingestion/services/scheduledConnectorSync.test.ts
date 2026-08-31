import { describe, expect, it, vi } from "vitest";
import { runScheduledConnectorSyncs } from "./scheduledConnectorSync";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

describe("scheduled connector sync", () => {
  it("continues after a project failure and returns a summary", async () => {
    const syncProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ status: "succeeded" })
      .mockResolvedValueOnce({ status: "failed" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await runScheduledConnectorSyncs({
      providers: ["gsc"],
      listProjects: async () => ["project-1", "project-2", "project-3"],
      syncProject,
    });

    expect(syncProject).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({
      candidates: 3,
      succeeded: 1,
      failed: 1,
      skipped: 0,
      errors: 1,
    });
    expect(error).toHaveBeenCalled();
  });
});
