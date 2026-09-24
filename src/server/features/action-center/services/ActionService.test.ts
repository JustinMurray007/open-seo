import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getLatestCompletedAudit: vi.fn(),
  getIssuesForAudit: vi.fn(),
  upsertFromAudit: vi.fn(),
  replaceEvidence: vi.fn(),
  listForProject: vi.fn(),
  getForProject: vi.fn(),
  updateStatus: vi.fn(),
  updateNotes: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock(
  "@/server/features/action-center/repositories/ActionRepository",
  () => ({ ActionRepository: repository }),
);

import {
  ActionService,
  sortActions,
} from "@/server/features/action-center/services/ActionService";

describe("ActionService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates getActionSummary to ActionRepository.getSummary", async () => {
    const mockSummary = {
      total: 5,
      openCount: 3,
      inProgressCount: 1,
      doneCount: 1,
      dismissedCount: 0,
      criticalCount: 1,
      warningCount: 2,
      topActions: [],
      latestActionAt: "2026-08-30T00:00:00.000Z",
    };
    repository.getSummary.mockResolvedValue(mockSummary);

    const result = await ActionService.getActionSummary("project-1");
    expect(repository.getSummary).toHaveBeenCalledWith("project-1");
    expect(result).toBe(mockSummary);
  });


  it("orders by severity, affected pages, then title", () => {
    expect(
      sortActions([
        { severity: "warning", affectedPageCount: 4, title: "B" },
        { severity: "critical", affectedPageCount: 1, title: "C" },
        { severity: "critical", affectedPageCount: 3, title: "A" },
      ]),
    ).toEqual([
      { severity: "critical", affectedPageCount: 3, title: "A" },
      { severity: "critical", affectedPageCount: 1, title: "C" },
      { severity: "warning", affectedPageCount: 4, title: "B" },
    ]);
  });

  it("groups the latest completed audit into stable fingerprints and evidence", async () => {
    repository.getLatestCompletedAudit.mockResolvedValue({
      id: "audit-2",
      completedAt: "2026-08-30T00:00:00.000Z",
      startedAt: "2026-08-29T00:00:00.000Z",
    });
    repository.getIssuesForAudit.mockResolvedValue([
      {
        id: "issue-1",
        issueType: "missing-title",
        pageUrl: "https://example.com/a",
        detailsJson: null,
      },
      {
        id: "issue-2",
        issueType: "missing-title",
        pageUrl: "https://example.com/b",
        detailsJson: '{"selector":"head"}',
      },
    ]);
    repository.upsertFromAudit.mockResolvedValue({
      id: "action-1",
      projectId: "project-1",
      fingerprint: "audit:v1:missing-title",
      status: "open",
      severity: "critical",
      source: "audit",
      sourceAuditId: "audit-2",
      issueType: "missing-title",
      title: "Missing title tag",
      reason: "reason",
      affectedPageCount: 2,
      firstSeenAt: "2026-08-30T00:00:00.000Z",
      lastSeenAt: "2026-08-30T00:00:00.000Z",
      notes: "",
      completedAt: null,
      dismissedAt: null,
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    });
    repository.listForProject.mockResolvedValue([]);

    const result = await ActionService.syncLatestAudit("project-1", "user-1");

    expect(repository.upsertFromAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: "audit:v1:missing-title",
        affectedPageCount: 2,
        sourceAuditId: "audit-2",
        title: "Missing title tag",
      }),
      "user-1",
    );
    expect(repository.replaceEvidence).toHaveBeenCalledWith(
      "action-1",
      "audit-2",
      expect.arrayContaining([
        expect.objectContaining({
          id: "action-1:issue-1",
          url: "https://example.com/a",
        }),
      ]),
    );
    expect(result.syncedActionCount).toBe(1);
  });
});
