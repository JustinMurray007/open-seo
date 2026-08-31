/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-type-assertion, typescript/unbound-method -- focused injected service test doubles */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorSyncRun } from "../repositories/ConnectorIngestionRepository";
import type { ConnectorProviderAdapter } from "../types";
import { ConnectorImportValidationError } from "../types";
import {
  AUTOMATIC_MAX_DAYS_PER_RUN,
  buildConnectorDatePlan,
  ConnectorIngestionService,
  ConnectorNotConnectedError,
  ConnectorSyncAlreadyRunningError,
} from "./ConnectorIngestionService";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const NOW = new Date("2026-08-31T04:14:00.000Z");

function baseRun(
  status: ConnectorSyncRun["status"] = "running",
): ConnectorSyncRun {
  return {
    id: "run-1",
    projectId: "project-1",
    provider: "gsc",
    sourceResourceId: "sc-domain:example.com",
    trigger: "manual",
    status,
    requestedStartDate: null,
    requestedEndDate: null,
    effectiveStartDate: "2026-07-31",
    effectiveEndDate: "2026-08-27",
    rowsWritten: status === "succeeded" ? 2 : 0,
    startedAt: NOW.toISOString(),
    completedAt: status === "running" ? null : NOW.toISOString(),
    errorCode: status === "failed" ? "upstream_unavailable" : null,
    errorMessage: status === "failed" ? "Provider unavailable." : null,
    actorUserId: "user-1",
  };
}

function harness() {
  let latest = baseRun();
  const repository = {
    getRunningRun: vi.fn().mockResolvedValue(null),
    getCursor: vi.fn().mockResolvedValue(null),
    getCursorForResource: vi.fn().mockResolvedValue(null),
    beginRun: vi.fn().mockResolvedValue(baseRun()),
    replaceGscDateFacts: vi.fn().mockResolvedValue(undefined),
    replaceGa4DateFacts: vi.fn().mockResolvedValue(undefined),
    advanceCursorDate: vi.fn().mockResolvedValue(undefined),
    markRunSucceeded: vi.fn().mockImplementation(async (input) => {
      latest = { ...baseRun("succeeded"), rowsWritten: input.rowsWritten };
    }),
    markRunFailed: vi.fn().mockImplementation(async (input) => {
      latest = {
        ...baseRun("failed"),
        rowsWritten: input.rowsWritten,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      };
    }),
    latestRun: vi.fn().mockImplementation(async () => latest),
    getRunById: vi.fn().mockImplementation(async () => latest),
  };
  const adapter: ConnectorProviderAdapter = {
    provider: "gsc",
    getConnection: vi.fn().mockResolvedValue({
      connectedByUserId: "user-1",
      accountId: "account-1",
      resourceId: "sc-domain:example.com",
    }),
    fetchPage: vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            date: "2026-08-27",
            query: "seo",
            page: "/",
            country: "usa",
            device: "mobile",
            searchType: "web",
            clicks: 1,
            impressions: 2,
            ctr: 0.5,
            position: 3,
          },
        ],
        hasMore: true,
        nextOffset: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            date: "2026-08-27",
            query: "tools",
            page: "/tools",
            country: "",
            device: "desktop",
            searchType: "web",
            clicks: 2,
            impressions: 4,
            ctr: 0.5,
            position: 2,
          },
        ],
        hasMore: false,
        nextOffset: 2,
      }),
  };
  const dependencies = {
    repository,
    adapterFor: () => adapter,
    now: () => NOW,
  };
  return { repository, adapter, dependencies };
}

describe("ConnectorIngestionService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("persists every page before marking the run successful", async () => {
    const { repository, adapter, dependencies } = harness();
    const run = await ConnectorIngestionService.sync(
      {
        projectId: "project-1",
        provider: "gsc",
        trigger: "manual",
        actorUserId: "user-1",
        startDate: "2026-08-27",
        endDate: "2026-08-27",
      },
      // The production dependency contract is intentionally complete; this
      // focused test double implements only methods exercised by sync.
      dependencies as never,
    );

    expect(adapter.fetchPage).toHaveBeenCalledTimes(2);
    expect(repository.replaceGscDateFacts).toHaveBeenCalledTimes(1);
    expect(repository.markRunSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ rowsWritten: 2 }),
    );
    expect(repository.beginRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: "sc-domain:example.com",
      }),
    );
    expect(repository.replaceGscDateFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: "sc-domain:example.com",
        date: "2026-08-27",
        rowsWritten: 2,
      }),
    );
    expect(repository.advanceCursorDate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: "sc-domain:example.com",
        date: "2026-08-27",
      }),
    );
    expect(run.status).toBe("succeeded");
  });

  it("preserves the failure as a completed run and does not mark success", async () => {
    const { repository, adapter, dependencies } = harness();
    vi.mocked(adapter.fetchPage).mockReset();
    vi.mocked(adapter.fetchPage).mockRejectedValue(new Error("network down"));

    const run = await ConnectorIngestionService.sync(
      { projectId: "project-1", provider: "gsc", trigger: "scheduled" },
      dependencies as never,
    );

    expect(repository.markRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        rowsWritten: 0,
        errorCode: "upstream_unavailable",
      }),
    );
    expect(repository.markRunSucceeded).not.toHaveBeenCalled();
    expect(run.status).toBe("failed");
  });

  it("classifies malformed provider rows as validation failures", async () => {
    const { repository, adapter, dependencies } = harness();
    vi.mocked(adapter.fetchPage).mockReset();
    vi.mocked(adapter.fetchPage).mockRejectedValue(
      new ConnectorImportValidationError("Missing date."),
    );

    const run = await ConnectorIngestionService.sync(
      { projectId: "project-1", provider: "gsc", trigger: "scheduled" },
      dependencies as never,
    );

    expect(repository.markRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "validation_error",
        nextRetryAt: null,
      }),
    );
    expect(run.status).toBe("failed");
  });

  it("rejects disconnected and concurrent syncs before creating a run", async () => {
    const first = harness();
    vi.mocked(first.adapter.getConnection).mockResolvedValue(null);
    await expect(
      ConnectorIngestionService.sync(
        { projectId: "project-1", provider: "gsc", trigger: "manual" },
        first.dependencies as never,
      ),
    ).rejects.toBeInstanceOf(ConnectorNotConnectedError);
    expect(first.repository.beginRun).not.toHaveBeenCalled();

    const second = harness();
    second.repository.getRunningRun.mockResolvedValue(baseRun());
    await expect(
      ConnectorIngestionService.sync(
        { projectId: "project-1", provider: "gsc", trigger: "manual" },
        second.dependencies as never,
      ),
    ).rejects.toBeInstanceOf(ConnectorSyncAlreadyRunningError);
    expect(second.repository.beginRun).not.toHaveBeenCalled();
  });

  it("bounds automatic backlog work while always adding GA4 correction dates", () => {
    const plan = buildConnectorDatePlan({
      provider: "ga4",
      trigger: "scheduled",
      explicitDates: false,
      range: {
        effectiveStartDate: "2026-07-01",
        effectiveEndDate: "2026-08-29",
      },
      latestCompleteDate: "2026-08-29",
    });

    expect(plan.filter((day) => day.advancesCursor)).toHaveLength(
      AUTOMATIC_MAX_DAYS_PER_RUN,
    );
    expect(plan.slice(-3).map((day) => day.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
    expect(plan.slice(-3).every((day) => !day.advancesCursor)).toBe(true);
  });

  it("does not promote a date when its page bound is exceeded", async () => {
    const { repository, dependencies } = harness();
    const run = await ConnectorIngestionService.sync(
      {
        projectId: "project-1",
        provider: "gsc",
        trigger: "manual",
        startDate: "2026-08-27",
        endDate: "2026-08-27",
      },
      { ...dependencies, maxPagesPerDate: 1 } as never,
    );

    expect(repository.replaceGscDateFacts).not.toHaveBeenCalled();
    expect(repository.markRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "invocation_limit",
        retryable: true,
      }),
    );
    expect(run.status).toBe("failed");
  });

  it("stops before fetching when the wall-clock deadline is exhausted", async () => {
    const { repository, adapter, dependencies } = harness();
    let clockReads = 0;
    const run = await ConnectorIngestionService.sync(
      {
        projectId: "project-1",
        provider: "gsc",
        trigger: "manual",
        startDate: "2026-08-27",
        endDate: "2026-08-27",
      },
      {
        ...dependencies,
        deadlineMs: 25_000,
        now: () =>
          clockReads++ === 0 ? NOW : new Date(NOW.valueOf() + 30_000),
      } as never,
    );

    expect(adapter.fetchPage).not.toHaveBeenCalled();
    expect(repository.markRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invocation_limit" }),
    );
    expect(run.status).toBe("failed");
  });

  it("expires a stale run lease before admitting a replacement", async () => {
    const { repository, dependencies } = harness();
    repository.getRunningRun.mockResolvedValue({
      ...baseRun(),
      startedAt: "2026-08-31T03:00:00.000Z",
    });

    await ConnectorIngestionService.sync(
      {
        projectId: "project-1",
        provider: "gsc",
        trigger: "manual",
        startDate: "2026-08-27",
        endDate: "2026-08-27",
      },
      dependencies as never,
    );

    expect(repository.markRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "stale_run",
        retryable: true,
      }),
    );
    expect(repository.beginRun).toHaveBeenCalled();
  });
});
