import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./ConnectorIngestionRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let testDb: LibSQLDatabase;
let repository: typeof RepositoryModule.ConnectorIngestionRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    executeInBatches: async <T>(
      items: T[],
      build: (db: LibSQLDatabase, item: T) => Promise<unknown>,
    ) => {
      for (const item of items) await build(testDb, item);
    },
    runBatch: async (
      build: (db: LibSQLDatabase) => Array<Promise<unknown>>,
    ) => {
      for (const statement of build(testDb)) await statement;
    },
  }));
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE gsc_connections (
      project_id text NOT NULL,
      site_url text NOT NULL DEFAULT 'resource-1'
    );
    CREATE TABLE ga4_connections (
      project_id text NOT NULL,
      property_id text NOT NULL DEFAULT 'resource-1'
    );
    CREATE TABLE connector_sync_cursors (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      provider text NOT NULL,
      source_resource_id text NOT NULL,
      last_attempt_at text,
      last_success_at text,
      last_complete_date text,
      consecutive_failures integer NOT NULL DEFAULT 0,
      last_error_code text,
      last_error_message text,
      next_retry_at text,
      retryable integer NOT NULL DEFAULT 1,
      updated_at text NOT NULL DEFAULT ''
    );
    CREATE TABLE connector_sync_runs (
      id text PRIMARY KEY,
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_resource_id text NOT NULL,
      rows_written integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'running',
      completed_at text,
      error_code text,
      error_message text
    );
    CREATE TABLE gsc_daily_facts (
      id text PRIMARY KEY,
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_resource_id text NOT NULL,
      date text NOT NULL,
      query text NOT NULL DEFAULT '',
      page text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '',
      device text NOT NULL DEFAULT '',
      search_type text NOT NULL DEFAULT 'web',
      clicks real NOT NULL DEFAULT 0,
      impressions real NOT NULL DEFAULT 0,
      ctr real NOT NULL DEFAULT 0,
      position real NOT NULL DEFAULT 0,
      source_run_id text NOT NULL REFERENCES connector_sync_runs(id) ON DELETE CASCADE,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      UNIQUE(project_id,source_resource_id,date,query,page,country,device,search_type)
    );
    CREATE TABLE ga4_daily_landing_page_facts (
      id text PRIMARY KEY,
      project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_resource_id text NOT NULL,
      date text NOT NULL,
      host_name text NOT NULL DEFAULT '',
      landing_page text NOT NULL DEFAULT '',
      channel text NOT NULL DEFAULT 'organic_search',
      sessions real NOT NULL DEFAULT 0,
      active_users real NOT NULL DEFAULT 0,
      engaged_sessions real NOT NULL DEFAULT 0,
      engagement_rate real NOT NULL DEFAULT 0,
      key_events real NOT NULL DEFAULT 0,
      transactions real NOT NULL DEFAULT 0,
      purchase_revenue real NOT NULL DEFAULT 0,
      source_run_id text NOT NULL REFERENCES connector_sync_runs(id) ON DELETE CASCADE,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      UNIQUE(project_id,source_resource_id,date,host_name,landing_page,channel)
    );
    INSERT INTO projects VALUES ('project-1');
    INSERT INTO connector_sync_runs (id,project_id,source_resource_id) VALUES ('run-1','project-1','resource-1');
    INSERT INTO connector_sync_runs (id,project_id,source_resource_id) VALUES ('run-2','project-1','resource-1');
    INSERT INTO connector_sync_runs (id,project_id,source_resource_id) VALUES ('run-3','project-1','resource-2');
    INSERT INTO connector_sync_runs (id,project_id,source_resource_id) VALUES ('run-4','project-1','resource-old');
  `);
  ({ ConnectorIngestionRepository: repository } =
    await import("./ConnectorIngestionRepository"));
});

afterAll(() => client.close());

describe("ConnectorIngestionRepository fact upserts", () => {
  it("atomically replaces a GSC resource/date slice and removes missing rows", async () => {
    const row = {
      date: "2026-08-27",
      query: "",
      page: "",
      country: "",
      device: "mobile",
      searchType: "web",
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 4,
    };
    await repository.replaceGscDateFacts({
      projectId: "project-1",
      runId: "run-1",
      sourceResourceId: "resource-1",
      date: row.date,
      rows: [row, { ...row, query: "removed later" }],
      rowsWritten: 2,
      nowIso: "2026-08-30T00:00:00.000Z",
    });
    await repository.replaceGscDateFacts({
      projectId: "project-1",
      runId: "run-2",
      sourceResourceId: "resource-1",
      date: row.date,
      rows: [{ ...row, clicks: 3, ctr: 0.3 }],
      rowsWritten: 1,
      nowIso: "2026-08-31T00:00:00.000Z",
    });

    const result = await client.execute(
      "SELECT count(*) count, clicks, ctr, source_run_id FROM gsc_daily_facts",
    );
    expect(result.rows[0]).toMatchObject({
      count: 1,
      clicks: 3,
      ctr: 0.3,
      source_run_id: "run-2",
    });

    await repository.replaceGscDateFacts({
      projectId: "project-1",
      runId: "run-3",
      sourceResourceId: "resource-2",
      date: row.date,
      rows: [{ ...row, clicks: 7 }],
      rowsWritten: 1,
      nowIso: "2026-08-31T01:00:00.000Z",
    });
    const separateResources = await client.execute(
      "SELECT count(*) count FROM gsc_daily_facts",
    );
    expect(separateResources.rows[0]?.count).toBe(2);
  });

  it("excludes terminal cursor failures from scheduled candidates", async () => {
    await client.execute(
      "INSERT INTO gsc_connections(project_id) VALUES ('project-1')",
    );
    await client.execute({
      sql: `INSERT INTO connector_sync_cursors
        (id,project_id,provider,source_resource_id,retryable)
        VALUES (?,?,?,?,?)`,
      args: ["cursor-1", "project-1", "gsc", "resource-1", 0],
    });

    await expect(
      repository.listRetryableConnectedProjectIds(
        "gsc",
        "2026-08-31T05:00:00.000Z",
      ),
    ).resolves.toEqual([]);

    await client.execute(
      "UPDATE connector_sync_cursors SET retryable = 1 WHERE id = 'cursor-1'",
    );
    await expect(
      repository.listRetryableConnectedProjectIds(
        "gsc",
        "2026-08-31T05:00:00.000Z",
      ),
    ).resolves.toEqual(["project-1"]);
  });

  it("schedules a new resource despite a terminal old-resource cursor", async () => {
    await client.execute(
      "UPDATE connector_sync_cursors SET source_resource_id = 'resource-old', retryable = 0 WHERE id = 'cursor-1'",
    );
    await client.execute(
      "UPDATE gsc_connections SET site_url = 'resource-new' WHERE project_id = 'project-1'",
    );

    await expect(
      repository.listRetryableConnectedProjectIds(
        "gsc",
        "2026-08-31T05:00:00.000Z",
      ),
    ).resolves.toEqual(["project-1"]);
  });

  it("does not let an old-resource run mutate a new-resource cursor", async () => {
    await client.execute(
      "UPDATE connector_sync_cursors SET source_resource_id = 'resource-new', consecutive_failures = 0, last_error_code = null WHERE id = 'cursor-1'",
    );
    await repository.markRunFailed({
      runId: "run-4",
      projectId: "project-1",
      provider: "gsc",
      sourceResourceId: "resource-old",
      completedAt: "2026-08-31T05:00:00.000Z",
      rowsWritten: 3,
      errorCode: "stale_run",
      errorMessage: "Expired.",
      nextRetryAt: "2026-08-31T05:05:00.000Z",
      retryable: true,
    });
    const cursor = await client.execute(
      "SELECT source_resource_id, consecutive_failures, last_error_code FROM connector_sync_cursors WHERE id = 'cursor-1'",
    );
    expect(cursor.rows[0]).toMatchObject({
      source_resource_id: "resource-new",
      consecutive_failures: 0,
      last_error_code: null,
    });
  });

  it("atomically replaces a GA4 resource/date slice and removes missing rows", async () => {
    const row = {
      date: "2026-08-29",
      hostName: "",
      landingPage: "/",
      channel: "organic_search",
      sessions: 2,
      activeUsers: 2,
      engagedSessions: 1,
      engagementRate: 0.5,
      keyEvents: 0,
      transactions: 0,
      purchaseRevenue: 0,
    };
    await repository.replaceGa4DateFacts({
      projectId: "project-1",
      runId: "run-1",
      sourceResourceId: "resource-1",
      date: row.date,
      rows: [row, { ...row, landingPage: "/removed-later" }],
      rowsWritten: 2,
      nowIso: "2026-08-30T00:00:00.000Z",
    });
    await repository.replaceGa4DateFacts({
      projectId: "project-1",
      runId: "run-2",
      sourceResourceId: "resource-1",
      date: row.date,
      rows: [{ ...row, sessions: 5, purchaseRevenue: 12.5 }],
      rowsWritten: 1,
      nowIso: "2026-08-31T00:00:00.000Z",
    });

    const result = await client.execute(
      "SELECT count(*) count, sessions, purchase_revenue, source_run_id FROM ga4_daily_landing_page_facts",
    );
    expect(result.rows[0]).toMatchObject({
      count: 1,
      sessions: 5,
      purchase_revenue: 12.5,
      source_run_id: "run-2",
    });

    await repository.replaceGa4DateFacts({
      projectId: "project-1",
      runId: "run-3",
      sourceResourceId: "resource-2",
      date: row.date,
      rows: [{ ...row, sessions: 9 }],
      rowsWritten: 1,
      nowIso: "2026-08-31T01:00:00.000Z",
    });
    const separateResources = await client.execute(
      "SELECT count(*) count FROM ga4_daily_landing_page_facts",
    );
    expect(separateResources.rows[0]?.count).toBe(2);
  });
});
