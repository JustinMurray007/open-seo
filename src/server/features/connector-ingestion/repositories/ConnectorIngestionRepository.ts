/* eslint-disable max-lines -- connector ingestion persistence keeps cross-dialect transaction invariants together */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  connectorSyncCursors,
  connectorSyncRuns,
  ga4Connections,
  ga4DailyLandingPageFacts,
  gscConnections,
  gscDailyFacts,
} from "@/db/schema";
import type {
  ConnectorDateRange,
  ConnectorProvider,
  ConnectorSyncTrigger,
  Ga4DailyLandingPageFactInput,
  GscDailyFactInput,
} from "../types";

export type ConnectorSyncRun = typeof connectorSyncRuns.$inferSelect;
export type ConnectorSyncCursor = typeof connectorSyncCursors.$inferSelect;

async function getCursor(
  projectId: string,
  provider: ConnectorProvider,
): Promise<ConnectorSyncCursor | null> {
  const [cursor] = await db
    .select()
    .from(connectorSyncCursors)
    .where(
      and(
        eq(connectorSyncCursors.projectId, projectId),
        eq(connectorSyncCursors.provider, provider),
      ),
    )
    .limit(1);
  return cursor ?? null;
}

async function getCursorForResource(
  projectId: string,
  provider: ConnectorProvider,
  sourceResourceId: string,
): Promise<ConnectorSyncCursor | null> {
  const cursor = await getCursor(projectId, provider);
  return cursor?.sourceResourceId === sourceResourceId ? cursor : null;
}

async function getRunningRun(
  projectId: string,
  provider: ConnectorProvider,
): Promise<ConnectorSyncRun | null> {
  const [run] = await db
    .select()
    .from(connectorSyncRuns)
    .where(
      and(
        eq(connectorSyncRuns.projectId, projectId),
        eq(connectorSyncRuns.provider, provider),
        eq(connectorSyncRuns.status, "running"),
      ),
    )
    .limit(1);
  return run ?? null;
}

async function getRunById(runId: string): Promise<ConnectorSyncRun | null> {
  const [run] = await db
    .select()
    .from(connectorSyncRuns)
    .where(eq(connectorSyncRuns.id, runId))
    .limit(1);
  return run ?? null;
}

async function beginRun(input: {
  projectId: string;
  provider: ConnectorProvider;
  trigger: ConnectorSyncTrigger;
  range: ConnectorDateRange;
  sourceResourceId: string;
  actorUserId: string | null;
  nowIso: string;
}): Promise<ConnectorSyncRun> {
  const id = crypto.randomUUID();
  await runBatch((tx) => [
    tx.insert(connectorSyncRuns).values({
      id,
      projectId: input.projectId,
      provider: input.provider,
      sourceResourceId: input.sourceResourceId,
      trigger: input.trigger,
      status: "running",
      requestedStartDate: input.range.requestedStartDate,
      requestedEndDate: input.range.requestedEndDate,
      effectiveStartDate: input.range.effectiveStartDate,
      effectiveEndDate: input.range.effectiveEndDate,
      rowsWritten: 0,
      startedAt: input.nowIso,
      actorUserId: input.actorUserId,
    }),
    tx
      .insert(connectorSyncCursors)
      .values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        provider: input.provider,
        sourceResourceId: input.sourceResourceId,
        lastAttemptAt: input.nowIso,
        consecutiveFailures: 0,
        updatedAt: input.nowIso,
      })
      .onConflictDoUpdate({
        target: [connectorSyncCursors.projectId, connectorSyncCursors.provider],
        set: {
          sourceResourceId: input.sourceResourceId,
          lastAttemptAt: input.nowIso,
          lastSuccessAt: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.lastSuccessAt} else null end`,
          lastCompleteDate: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.lastCompleteDate} else null end`,
          consecutiveFailures: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.consecutiveFailures} else 0 end`,
          lastErrorCode: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.lastErrorCode} else null end`,
          lastErrorMessage: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.lastErrorMessage} else null end`,
          nextRetryAt: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.nextRetryAt} else null end`,
          retryable: sql`case when ${connectorSyncCursors.sourceResourceId} = ${input.sourceResourceId} then ${connectorSyncCursors.retryable} else true end`,
          updatedAt: input.nowIso,
        },
      }),
  ]);
  const run = await getRunById(id);
  if (!run) throw new Error("Failed to create connector sync run.");
  return run;
}

async function markRunSucceeded(input: {
  runId: string;
  completedAt: string;
  rowsWritten: number;
}): Promise<void> {
  await db
    .update(connectorSyncRuns)
    .set({
      status: "succeeded",
      completedAt: input.completedAt,
      rowsWritten: input.rowsWritten,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(connectorSyncRuns.id, input.runId),
        eq(connectorSyncRuns.status, "running"),
      ),
    );
}

async function markRunFailed(input: {
  runId: string;
  sourceResourceId: string;
  projectId: string;
  provider: ConnectorProvider;
  completedAt: string;
  rowsWritten: number;
  errorCode: string;
  errorMessage: string;
  nextRetryAt: string | null;
  retryable: boolean;
}): Promise<void> {
  await runBatch((tx) => [
    tx
      .update(connectorSyncRuns)
      .set({
        status: "failed",
        completedAt: input.completedAt,
        rowsWritten: input.rowsWritten,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      })
      .where(
        and(
          eq(connectorSyncRuns.id, input.runId),
          eq(connectorSyncRuns.status, "running"),
        ),
      ),
    tx
      .update(connectorSyncCursors)
      .set({
        consecutiveFailures: sql`${connectorSyncCursors.consecutiveFailures} + 1`,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        nextRetryAt: input.nextRetryAt,
        retryable: input.retryable,
        updatedAt: input.completedAt,
      })
      .where(
        and(
          eq(connectorSyncCursors.projectId, input.projectId),
          eq(connectorSyncCursors.provider, input.provider),
          eq(connectorSyncCursors.sourceResourceId, input.sourceResourceId),
        ),
      ),
  ]);
}

async function replaceGscDateFacts(input: {
  projectId: string;
  runId: string;
  sourceResourceId: string;
  date: string;
  rows: GscDailyFactInput[];
  rowsWritten: number;
  nowIso: string;
}): Promise<void> {
  if (input.rows.some((row) => row.date !== input.date)) {
    throw new Error("GSC replacement rows must belong to one date.");
  }
  await runBatch((tx) => [
    tx
      .delete(gscDailyFacts)
      .where(
        and(
          eq(gscDailyFacts.projectId, input.projectId),
          eq(gscDailyFacts.sourceResourceId, input.sourceResourceId),
          eq(gscDailyFacts.date, input.date),
        ),
      ),
    ...input.rows.map((row) =>
      tx.insert(gscDailyFacts).values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        sourceResourceId: input.sourceResourceId,
        ...row,
        sourceRunId: input.runId,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      }),
    ),
    tx
      .update(connectorSyncRuns)
      .set({ rowsWritten: input.rowsWritten })
      .where(
        and(
          eq(connectorSyncRuns.id, input.runId),
          eq(connectorSyncRuns.status, "running"),
        ),
      ),
  ]);
}

async function replaceGa4DateFacts(input: {
  projectId: string;
  runId: string;
  sourceResourceId: string;
  date: string;
  rows: Ga4DailyLandingPageFactInput[];
  rowsWritten: number;
  nowIso: string;
}): Promise<void> {
  if (input.rows.some((row) => row.date !== input.date)) {
    throw new Error("GA4 replacement rows must belong to one date.");
  }
  await runBatch((tx) => [
    tx
      .delete(ga4DailyLandingPageFacts)
      .where(
        and(
          eq(ga4DailyLandingPageFacts.projectId, input.projectId),
          eq(ga4DailyLandingPageFacts.sourceResourceId, input.sourceResourceId),
          eq(ga4DailyLandingPageFacts.date, input.date),
        ),
      ),
    ...input.rows.map((row) =>
      tx.insert(ga4DailyLandingPageFacts).values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        sourceResourceId: input.sourceResourceId,
        ...row,
        sourceRunId: input.runId,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      }),
    ),
    tx
      .update(connectorSyncRuns)
      .set({ rowsWritten: input.rowsWritten })
      .where(
        and(
          eq(connectorSyncRuns.id, input.runId),
          eq(connectorSyncRuns.status, "running"),
        ),
      ),
  ]);
}

async function advanceCursorDate(input: {
  projectId: string;
  provider: ConnectorProvider;
  sourceResourceId: string;
  date: string;
  completedAt: string;
}): Promise<void> {
  await db
    .update(connectorSyncCursors)
    .set({
      lastSuccessAt: input.completedAt,
      lastCompleteDate: sql`case
        when ${connectorSyncCursors.lastCompleteDate} is null
          or ${connectorSyncCursors.lastCompleteDate} < ${input.date}
        then ${input.date}
        else ${connectorSyncCursors.lastCompleteDate}
      end`,
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextRetryAt: null,
      retryable: true,
      updatedAt: input.completedAt,
    })
    .where(
      and(
        eq(connectorSyncCursors.projectId, input.projectId),
        eq(connectorSyncCursors.provider, input.provider),
        eq(connectorSyncCursors.sourceResourceId, input.sourceResourceId),
      ),
    );
}

async function listRuns(input: {
  projectId: string;
  provider: ConnectorProvider;
  limit: number;
}): Promise<ConnectorSyncRun[]> {
  return db
    .select()
    .from(connectorSyncRuns)
    .where(
      and(
        eq(connectorSyncRuns.projectId, input.projectId),
        eq(connectorSyncRuns.provider, input.provider),
      ),
    )
    .orderBy(desc(connectorSyncRuns.startedAt))
    .limit(input.limit);
}

async function latestRun(
  projectId: string,
  provider: ConnectorProvider,
): Promise<ConnectorSyncRun | null> {
  return (await listRuns({ projectId, provider, limit: 1 }))[0] ?? null;
}

async function latestRunForResource(
  projectId: string,
  provider: ConnectorProvider,
  sourceResourceId: string,
): Promise<ConnectorSyncRun | null> {
  const [run] = await db
    .select()
    .from(connectorSyncRuns)
    .where(
      and(
        eq(connectorSyncRuns.projectId, projectId),
        eq(connectorSyncRuns.provider, provider),
        eq(connectorSyncRuns.sourceResourceId, sourceResourceId),
      ),
    )
    .orderBy(desc(connectorSyncRuns.startedAt))
    .limit(1);
  return run ?? null;
}

async function listConnectedProjectIds(
  provider: ConnectorProvider,
): Promise<string[]> {
  const table = provider === "gsc" ? gscConnections : ga4Connections;
  const rows = await db.select({ projectId: table.projectId }).from(table);
  return rows.map((row) => row.projectId);
}

async function listRetryableConnectedProjectIds(
  provider: ConnectorProvider,
  nowIso: string,
): Promise<string[]> {
  const connected =
    provider === "gsc"
      ? await db
          .select({
            projectId: gscConnections.projectId,
            sourceResourceId: gscConnections.siteUrl,
          })
          .from(gscConnections)
      : await db
          .select({
            projectId: ga4Connections.projectId,
            sourceResourceId: ga4Connections.propertyId,
          })
          .from(ga4Connections);
  if (connected.length === 0) return [];
  const cursors = await db
    .select({
      projectId: connectorSyncCursors.projectId,
      sourceResourceId: connectorSyncCursors.sourceResourceId,
      nextRetryAt: connectorSyncCursors.nextRetryAt,
      retryable: connectorSyncCursors.retryable,
    })
    .from(connectorSyncCursors)
    .where(eq(connectorSyncCursors.provider, provider));
  const byProject = new Map(cursors.map((row) => [row.projectId, row]));
  return connected
    .filter(({ projectId, sourceResourceId }) => {
      const cursor = byProject.get(projectId);
      if (!cursor || cursor.sourceResourceId !== sourceResourceId) return true;
      return (
        cursor.retryable &&
        (!cursor.nextRetryAt || cursor.nextRetryAt <= nowIso)
      );
    })
    .map(({ projectId }) => projectId);
}

async function resetCursorForResource(
  projectId: string,
  provider: ConnectorProvider,
  sourceResourceId: string,
  nowIso = new Date().toISOString(),
): Promise<void> {
  await db
    .insert(connectorSyncCursors)
    .values({
      id: crypto.randomUUID(),
      projectId,
      provider,
      sourceResourceId,
      consecutiveFailures: 0,
      retryable: true,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: [connectorSyncCursors.projectId, connectorSyncCursors.provider],
      set: {
        sourceResourceId,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastCompleteDate: null,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextRetryAt: null,
        retryable: true,
        updatedAt: nowIso,
      },
    });
}

export const ConnectorIngestionRepository = {
  getCursor,
  getCursorForResource,
  getRunningRun,
  getRunById,
  beginRun,
  markRunSucceeded,
  markRunFailed,
  replaceGscDateFacts,
  replaceGa4DateFacts,
  advanceCursorDate,
  listRuns,
  latestRun,
  latestRunForResource,
  listConnectedProjectIds,
  listRetryableConnectedProjectIds,
  resetCursorForResource,
};
