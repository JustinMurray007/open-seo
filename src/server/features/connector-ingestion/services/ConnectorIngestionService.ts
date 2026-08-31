/* eslint-disable max-lines -- orchestration keeps admission, bounded execution, promotion, and health policy together */
import { ConnectorIngestionRepository } from "../repositories/ConnectorIngestionRepository";
import {
  latestCompleteGa4Date,
  latestCompleteGscDate,
  resolveGa4SyncRange,
  resolveGscSyncRange,
} from "../datePolicy";
import { classifyConnectorSyncError } from "../errorClassification";
import { getConnectorAdapter } from "../providerAdapters";
import { shiftGa4Date } from "@/server/features/ga4/services/Ga4Dates";
import {
  ConnectorImportValidationError,
  ConnectorInvocationLimitError,
} from "../types";
import type {
  ConnectorHealthState,
  ConnectorProvider,
  ConnectorProviderAdapter,
  ConnectorSyncTrigger,
  Ga4DailyLandingPageFactInput,
  GscDailyFactInput,
} from "../types";

// Inline Worker bounds. Automatic backfills resume from the resource cursor on
// the next daily run; one high-volume date may consume at most 20 API pages.
export const AUTOMATIC_MAX_DAYS_PER_RUN = 7;
export const MAX_PAGES_PER_DATE = 20;
export const SYNC_DEADLINE_MS = 25_000;
export const STALE_RUN_LEASE_MS = 30 * 60_000;

export class ConnectorNotConnectedError extends Error {
  constructor(public readonly provider: ConnectorProvider) {
    super(`${provider} is not connected for this project.`);
    this.name = "ConnectorNotConnectedError";
  }
}

export class ConnectorSyncAlreadyRunningError extends Error {
  constructor(public readonly provider: ConnectorProvider) {
    super(`A ${provider} sync is already running for this project.`);
    this.name = "ConnectorSyncAlreadyRunningError";
  }
}

type Repository = typeof ConnectorIngestionRepository;

type ServiceDependencies = {
  repository: Repository;
  adapterFor(provider: ConnectorProvider): ConnectorProviderAdapter;
  now(): Date;
  automaticMaxDays?: number;
  maxPagesPerDate?: number;
  deadlineMs?: number;
  staleRunLeaseMs?: number;
};

const defaultDependencies: ServiceDependencies = {
  repository: ConnectorIngestionRepository,
  adapterFor: getConnectorAdapter,
  now: () => new Date(),
};

function resolveRange(input: {
  provider: ConnectorProvider;
  now: Date;
  propertyTimeZone?: string;
  lastCompleteDate: string | null;
  startDate?: string;
  endDate?: string;
}) {
  return input.provider === "gsc"
    ? resolveGscSyncRange(input)
    : resolveGa4SyncRange({
        ...input,
        propertyTimeZone: input.propertyTimeZone ?? "UTC",
      });
}

type DatePlan = { date: string; advancesCursor: boolean };

function datesBetween(startDate: string, endDate: string, limit: number) {
  const dates: string[] = [];
  for (
    let date = startDate;
    date <= endDate && dates.length < limit;
    date = shiftGa4Date(date, 1)
  ) {
    dates.push(date);
  }
  return dates;
}

export function buildConnectorDatePlan(input: {
  provider: ConnectorProvider;
  trigger: ConnectorSyncTrigger;
  explicitDates: boolean;
  range: { effectiveStartDate: string; effectiveEndDate: string };
  latestCompleteDate: string;
  automaticMaxDays?: number;
}): DatePlan[] {
  const automatic = input.trigger !== "manual" || !input.explicitDates;
  const limit = automatic
    ? (input.automaticMaxDays ?? AUTOMATIC_MAX_DAYS_PER_RUN)
    : Number.POSITIVE_INFINITY;
  const backlog = datesBetween(
    input.range.effectiveStartDate,
    input.range.effectiveEndDate,
    limit,
  );
  const plan = new Map(
    backlog.map((date) => [date, { date, advancesCursor: true }]),
  );
  if (input.provider === "ga4" && !input.explicitDates) {
    for (const date of datesBetween(
      shiftGa4Date(input.latestCompleteDate, -2),
      input.latestCompleteDate,
      3,
    )) {
      if (!plan.has(date)) plan.set(date, { date, advancesCursor: false });
    }
  }
  return [...plan.values()].toSorted((a, b) => a.date.localeCompare(b.date));
}

async function promoteDate(input: {
  repository: Repository;
  provider: ConnectorProvider;
  projectId: string;
  runId: string;
  sourceResourceId: string;
  date: string;
  rows: GscDailyFactInput[] | Ga4DailyLandingPageFactInput[];
  rowsWritten: number;
  nowIso: string;
}): Promise<void> {
  if (input.provider === "gsc") {
    await input.repository.replaceGscDateFacts({
      ...input,
      // The provider discriminant selects the GSC adapter and fact repository.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      rows: input.rows as GscDailyFactInput[],
    });
  } else {
    await input.repository.replaceGa4DateFacts({
      ...input,
      // The provider discriminant selects the GA4 adapter and fact repository.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      rows: input.rows as Ga4DailyLandingPageFactInput[],
    });
  }
}

async function reconcileRunningRun(input: {
  running: Awaited<ReturnType<Repository["getRunningRun"]>>;
  connectionResourceId: string;
  projectId: string;
  provider: ConnectorProvider;
  now: Date;
  repository: Repository;
  staleRunLeaseMs: number;
}): Promise<void> {
  if (!input.running) return;
  const startedAt = Date.parse(input.running.startedAt);
  const resourceChanged =
    input.running.sourceResourceId !== input.connectionResourceId;
  const stale =
    !Number.isFinite(startedAt) ||
    input.now.valueOf() - startedAt >= input.staleRunLeaseMs;
  if (!resourceChanged && !stale) {
    throw new ConnectorSyncAlreadyRunningError(input.provider);
  }
  await input.repository.markRunFailed({
    runId: input.running.id,
    projectId: input.projectId,
    provider: input.provider,
    sourceResourceId: input.running.sourceResourceId,
    completedAt: input.now.toISOString(),
    rowsWritten: input.running.rowsWritten,
    errorCode: resourceChanged ? "resource_changed" : "stale_run",
    errorMessage: resourceChanged
      ? "The connected property changed before this sync completed."
      : "The previous connector sync lease expired.",
    nextRetryAt: resourceChanged ? null : input.now.toISOString(),
    retryable: !resourceChanged,
  });
}

async function sync(
  input: {
    projectId: string;
    provider: ConnectorProvider;
    trigger: ConnectorSyncTrigger;
    actorUserId?: string | null;
    startDate?: string;
    endDate?: string;
  },
  dependencies: ServiceDependencies = defaultDependencies,
) {
  const adapter = dependencies.adapterFor(input.provider);
  const connection = await adapter.getConnection(input.projectId);
  if (!connection) throw new ConnectorNotConnectedError(input.provider);

  const started = dependencies.now();
  const running = await dependencies.repository.getRunningRun(
    input.projectId,
    input.provider,
  );
  await reconcileRunningRun({
    running,
    connectionResourceId: connection.resourceId,
    projectId: input.projectId,
    provider: input.provider,
    now: started,
    repository: dependencies.repository,
    staleRunLeaseMs: dependencies.staleRunLeaseMs ?? STALE_RUN_LEASE_MS,
  });

  const cursor = await dependencies.repository.getCursorForResource(
    input.projectId,
    input.provider,
    connection.resourceId,
  );
  const requestedRange = resolveRange({
    provider: input.provider,
    now: started,
    propertyTimeZone: connection.propertyTimeZone,
    lastCompleteDate: cursor?.lastCompleteDate ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const latestCompleteDate =
    input.provider === "gsc"
      ? latestCompleteGscDate(started)
      : latestCompleteGa4Date(started, connection.propertyTimeZone ?? "UTC");
  const datePlan = buildConnectorDatePlan({
    provider: input.provider,
    trigger: input.trigger,
    explicitDates: Boolean(input.startDate && input.endDate),
    range: requestedRange,
    latestCompleteDate,
    automaticMaxDays: dependencies.automaticMaxDays,
  });
  const firstDate = datePlan[0]?.date;
  const lastDate = datePlan.at(-1)?.date;
  if (!firstDate || !lastDate) {
    throw new ConnectorImportValidationError("Connector date plan is empty.");
  }
  const range = {
    ...requestedRange,
    effectiveStartDate: firstDate,
    effectiveEndDate: lastDate,
  };

  let run;
  try {
    run = await dependencies.repository.beginRun({
      projectId: input.projectId,
      provider: input.provider,
      trigger: input.trigger,
      range,
      actorUserId: input.actorUserId ?? null,
      sourceResourceId: connection.resourceId,
      nowIso: started.toISOString(),
    });
  } catch (error) {
    if (
      await dependencies.repository.getRunningRun(
        input.projectId,
        input.provider,
      )
    ) {
      throw new ConnectorSyncAlreadyRunningError(input.provider);
    }
    throw error;
  }

  let rowsWritten = 0;
  const deadlineAt =
    started.valueOf() + (dependencies.deadlineMs ?? SYNC_DEADLINE_MS);
  const maxPages = dependencies.maxPagesPerDate ?? MAX_PAGES_PER_DATE;
  try {
    for (const plannedDate of datePlan) {
      let offset = 0;
      const dateRows: Array<GscDailyFactInput | Ga4DailyLandingPageFactInput> =
        [];
      for (let page = 0; page < maxPages; page += 1) {
        if (dependencies.now().valueOf() >= deadlineAt) {
          throw new ConnectorInvocationLimitError(
            "Connector sync reached its wall-clock deadline.",
          );
        }
        const result = await adapter.fetchPage({
          projectId: input.projectId,
          connection,
          startDate: plannedDate.date,
          endDate: plannedDate.date,
          offset,
        });
        if (result.rows.some((row) => row.date !== plannedDate.date)) {
          throw new ConnectorImportValidationError(
            "Provider returned a row outside the requested date.",
          );
        }
        dateRows.push(...result.rows);
        if (!result.hasMore) break;
        if (result.nextOffset <= offset) {
          throw new ConnectorImportValidationError(
            "Connector pagination did not advance.",
          );
        }
        offset = result.nextOffset;
        if (page === maxPages - 1) {
          throw new ConnectorInvocationLimitError(
            "Connector date exceeded the page safety limit.",
          );
        }
      }
      if (dependencies.now().valueOf() >= deadlineAt) {
        throw new ConnectorInvocationLimitError(
          "Connector sync reached its wall-clock deadline.",
        );
      }
      const nowIso = dependencies.now().toISOString();
      const nextRowsWritten = rowsWritten + dateRows.length;
      await promoteDate({
        repository: dependencies.repository,
        provider: input.provider,
        projectId: input.projectId,
        runId: run.id,
        sourceResourceId: connection.resourceId,
        date: plannedDate.date,
        // One provider adapter is fixed for the run, so this array cannot mix
        // fact shapes even though the shared orchestration stores the union.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        rows: dateRows as GscDailyFactInput[] | Ga4DailyLandingPageFactInput[],
        rowsWritten: nextRowsWritten,
        nowIso,
      });
      rowsWritten = nextRowsWritten;
      if (plannedDate.advancesCursor) {
        await dependencies.repository.advanceCursorDate({
          projectId: input.projectId,
          provider: input.provider,
          sourceResourceId: connection.resourceId,
          date: plannedDate.date,
          completedAt: nowIso,
        });
      }
    }
    const completedAt = dependencies.now().toISOString();
    await dependencies.repository.markRunSucceeded({
      runId: run.id,
      completedAt,
      rowsWritten,
    });
  } catch (error) {
    const completed = dependencies.now();
    const classified = classifyConnectorSyncError(error, completed);
    await dependencies.repository.markRunFailed({
      runId: run.id,
      projectId: input.projectId,
      provider: input.provider,
      sourceResourceId: connection.resourceId,
      completedAt: completed.toISOString(),
      rowsWritten,
      errorCode: classified.code,
      errorMessage: classified.message,
      nextRetryAt: classified.retryAt?.toISOString() ?? null,
      retryable: classified.retryable,
    });
  }
  const completedRun = await dependencies.repository.getRunById(run.id);
  if (!completedRun)
    throw new Error("Connector sync run could not be reloaded.");
  return completedRun;
}

function healthState(input: {
  connected: boolean;
  latestStatus: "running" | "succeeded" | "failed" | null;
  lastCompleteDate: string | null;
  latestCompleteDate: string;
  consecutiveFailures: number;
}): ConnectorHealthState {
  if (!input.connected) return "disconnected";
  if (input.latestStatus === "running") return "syncing";
  if (input.consecutiveFailures > 0 || input.latestStatus === "failed") {
    return "error";
  }
  if (!input.lastCompleteDate) return "never_synced";
  return input.lastCompleteDate >= input.latestCompleteDate
    ? "healthy"
    : "stale";
}

async function getProviderHealth(
  projectId: string,
  provider: ConnectorProvider,
  dependencies: ServiceDependencies = defaultDependencies,
) {
  const adapter = dependencies.adapterFor(provider);
  const connection = await adapter.getConnection(projectId);
  const [cursor, latestRun] = await (connection
    ? Promise.all([
        dependencies.repository.getCursorForResource(
          projectId,
          provider,
          connection.resourceId,
        ),
        dependencies.repository.latestRunForResource(
          projectId,
          provider,
          connection.resourceId,
        ),
      ])
    : Promise.all([
        dependencies.repository.getCursor(projectId, provider),
        dependencies.repository.latestRun(projectId, provider),
      ]));
  const now = dependencies.now();
  const latestCompleteDate =
    provider === "gsc"
      ? latestCompleteGscDate(now)
      : latestCompleteGa4Date(now, connection?.propertyTimeZone ?? "UTC");
  return {
    provider,
    connected: Boolean(connection),
    state: healthState({
      connected: Boolean(connection),
      latestStatus: latestRun?.status ?? null,
      lastCompleteDate: cursor?.lastCompleteDate ?? null,
      latestCompleteDate,
      consecutiveFailures: cursor?.consecutiveFailures ?? 0,
    }),
    latestCompleteDate,
    latestRun,
    cursor,
  };
}

async function getHealth(
  projectId: string,
  dependencies: ServiceDependencies = defaultDependencies,
) {
  const [gsc, ga4] = await Promise.all([
    getProviderHealth(projectId, "gsc", dependencies),
    getProviderHealth(projectId, "ga4", dependencies),
  ]);
  return { gsc, ga4 };
}

export const ConnectorIngestionService = {
  sync,
  getProviderHealth,
  getHealth,
};
