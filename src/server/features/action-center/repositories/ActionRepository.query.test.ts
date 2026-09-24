import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as RepositoryModule from "./ActionRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let ActionRepository: typeof RepositoryModule.ActionRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "CREATE TABLE audits (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project-1');",
      "INSERT INTO audits (id) VALUES ('audit-1'), ('audit-2');",
      ...readFileSync("drizzle/0043_needy_nitro.sql", "utf8").split(
        "--> statement-breakpoint",
      ),
    ].join("\n"),
  );
  ({ ActionRepository } = await import("./ActionRepository"));
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM action_events;
    DELETE FROM action_evidence;
    DELETE FROM actions;
  `);
});

const baseInput = {
  id: "action-1",
  projectId: "project-1",
  fingerprint: "audit:v1:missing-title",
  severity: "critical" as const,
  sourceAuditId: "audit-1",
  issueType: "missing-title",
  title: "Missing title tag",
  reason: "A title is required.",
  affectedPageCount: 2,
  seenAt: "2026-08-29T00:00:00.000Z",
};

describe("ActionRepository audit upsert", () => {
  it("preserves manual notes/status on repeat sync and replaces evidence", async () => {
    const first = await ActionRepository.upsertFromAudit(baseInput, "user-1");
    await ActionRepository.updateStatus({
      actionId: first.id,
      projectId: "project-1",
      status: "planned",
      actorUserId: "user-1",
    });
    await ActionRepository.updateNotes({
      actionId: first.id,
      projectId: "project-1",
      notes: "Assigned to Morgan",
      actorUserId: "user-1",
    });
    await ActionRepository.replaceEvidence(first.id, "audit-1", [
      { id: "evidence-1", url: "https://example.com/a", detailsJson: null },
    ]);

    await ActionRepository.upsertFromAudit(
      { ...baseInput, id: "ignored", affectedPageCount: 3 },
      "user-1",
    );
    await ActionRepository.replaceEvidence(first.id, "audit-1", [
      { id: "evidence-2", url: "https://example.com/b", detailsJson: null },
    ]);

    const [row] = await ActionRepository.listForProject({
      projectId: "project-1",
    });
    expect(row).toMatchObject({
      id: "action-1",
      status: "planned",
      notes: "Assigned to Morgan",
      affectedPageCount: 3,
    });
    expect(row?.evidence.map((item) => item.url)).toEqual([
      "https://example.com/b",
    ]);
  });

  it("reopens a done action when it appears in a newer audit", async () => {
    const first = await ActionRepository.upsertFromAudit(baseInput, "user-1");
    await ActionRepository.updateStatus({
      actionId: first.id,
      projectId: "project-1",
      status: "done",
      actorUserId: "user-1",
    });
    const reopened = await ActionRepository.upsertFromAudit(
      {
        ...baseInput,
        id: "ignored",
        sourceAuditId: "audit-2",
        seenAt: "2026-08-30T00:00:00.000Z",
      },
      "user-1",
    );

    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeNull();
  });
});

describe("ActionRepository.getSummary", () => {
  it("returns zero counts and empty lists for a project with no actions", async () => {
    const summary = await ActionRepository.getSummary("project-1");
    expect(summary).toEqual({
      total: 0,
      openCount: 0,
      inProgressCount: 0,
      doneCount: 0,
      dismissedCount: 0,
      criticalCount: 0,
      warningCount: 0,
      topActions: [],
      latestActionAt: null,
    });
  });

  it("accurately computes status counts and orders topActions by priority", async () => {
    // Action 1: critical, open, 5 pages
    await ActionRepository.upsertFromAudit(
      {
        ...baseInput,
        id: "action-1",
        fingerprint: "audit:v1:broken-links",
        title: "Broken links",
        severity: "critical",
        affectedPageCount: 5,
        seenAt: "2026-08-30T00:00:00.000Z",
      },
      "user-1",
    );

    // Action 2: warning, in_progress, 10 pages
    const act2 = await ActionRepository.upsertFromAudit(
      {
        ...baseInput,
        id: "action-2",
        fingerprint: "audit:v1:slow-pages",
        title: "Slow pages",
        severity: "warning",
        affectedPageCount: 10,
        seenAt: "2026-08-30T01:00:00.000Z",
      },
      "user-1",
    );
    await ActionRepository.updateStatus({
      actionId: act2.id,
      projectId: "project-1",
      status: "in_progress",
      actorUserId: "user-1",
    });

    // Action 3: critical, done, 2 pages
    const act3 = await ActionRepository.upsertFromAudit(
      {
        ...baseInput,
        id: "action-3",
        fingerprint: "audit:v1:missing-h1",
        title: "Missing H1",
        severity: "critical",
        affectedPageCount: 2,
        seenAt: "2026-08-30T02:00:00.000Z",
      },
      "user-1",
    );
    await ActionRepository.updateStatus({
      actionId: act3.id,
      projectId: "project-1",
      status: "done",
      actorUserId: "user-1",
    });

    // Action 4: info, open, 1 page
    await ActionRepository.upsertFromAudit(
      {
        ...baseInput,
        id: "action-4",
        fingerprint: "audit:v1:missing-alt",
        title: "Missing alt tags",
        severity: "info",
        affectedPageCount: 1,
        seenAt: "2026-08-30T03:00:00.000Z",
      },
      "user-1",
    );

    const summary = await ActionRepository.getSummary("project-1");
    expect(summary.total).toBe(4);
    expect(summary.openCount).toBe(2); // action-1 + action-4
    expect(summary.inProgressCount).toBe(1); // action-2
    expect(summary.doneCount).toBe(1); // action-3
    expect(summary.dismissedCount).toBe(0);
    expect(summary.criticalCount).toBe(1); // action-1 (action-3 is done, not counted in open critical)
    expect(summary.warningCount).toBe(1); // action-2 (in_progress warning)

    // topActions excludes done (action-3) and sorts:
    // 1st: action-1 (critical)
    // 2nd: action-2 (warning)
    // 3rd: action-4 (info)
    expect(summary.topActions.map((a) => a.id)).toEqual([
      "action-1",
      "action-2",
      "action-4",
    ]);
  });
});

