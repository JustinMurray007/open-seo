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
import type * as RepositoryModule from "./Page360Repository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let Page360Repository: typeof RepositoryModule.Page360Repository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(`
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE audits (
      id text PRIMARY KEY,
      project_id text,
      started_by_user_id text DEFAULT 'user-1',
      start_url text DEFAULT 'https://example.com',
      status text DEFAULT 'completed',
      config text DEFAULT '{}',
      pages_crawled integer DEFAULT 1,
      pages_total integer DEFAULT 1,
      lighthouse_total integer DEFAULT 0,
      lighthouse_completed integer DEFAULT 0,
      lighthouse_failed integer DEFAULT 0,
      current_phase text DEFAULT 'done',
      workflow_instance_id text,
      error_code text,
      error_detail text,
      failed_phase text,
      started_at text,
      completed_at text
    );
    CREATE TABLE audit_pages (
      id text PRIMARY KEY,
      audit_id text,
      url text,
      status_code integer,
      redirect_url text,
      title text,
      meta_description text,
      canonical_url text,
      robots_meta text,
      og_title text,
      og_description text,
      og_image text,
      h1_count integer DEFAULT 1,
      h2_count integer DEFAULT 0,
      h3_count integer DEFAULT 0,
      h4_count integer DEFAULT 0,
      h5_count integer DEFAULT 0,
      h6_count integer DEFAULT 0,
      heading_order_json text,
      word_count integer DEFAULT 250,
      images_total integer DEFAULT 2,
      images_missing_alt integer DEFAULT 0,
      images_json text,
      internal_link_count integer DEFAULT 5,
      external_link_count integer DEFAULT 1,
      has_structured_data integer DEFAULT 0,
      hreflang_tags_json text,
      is_indexable integer DEFAULT 1,
      x_robots_tag text,
      header_canonical_url text,
      crawl_depth integer DEFAULT 0,
      in_sitemap integer DEFAULT 1,
      content_hash text,
      fetch_class text DEFAULT 'ok'
    );
    CREATE TABLE audit_issues (
      id text PRIMARY KEY,
      audit_id text,
      page_id text,
      page_url text,
      issue_type text,
      severity text,
      details_json text
    );
    CREATE TABLE audit_lighthouse_results (
      id text PRIMARY KEY,
      audit_id text,
      page_id text,
      strategy text,
      performance_score integer,
      accessibility_score integer,
      best_practices_score integer,
      seo_score integer,
      lcp_ms real,
      cls real,
      inp_ms real,
      ttfb_ms real,
      error_message text,
      r2_key text,
      payload_size_bytes integer
    );
    CREATE TABLE actions (
      id text PRIMARY KEY,
      project_id text,
      fingerprint text DEFAULT 'fp-1',
      status text DEFAULT 'open',
      severity text DEFAULT 'critical',
      source text DEFAULT 'audit',
      source_audit_id text,
      issue_type text,
      title text,
      reason text,
      affected_page_count integer DEFAULT 1,
      first_seen_at text,
      last_seen_at text,
      completed_at text,
      dismissed_at text,
      notes text,
      created_at text,
      updated_at text
    );
    CREATE TABLE action_evidence (
      id text PRIMARY KEY,
      action_id text,
      audit_id text,
      url text,
      details_json text
    );
    CREATE TABLE connector_sync_runs (
      id text PRIMARY KEY,
      project_id text,
      provider text DEFAULT 'gsc',
      source_resource_id text DEFAULT 'res-1',
      trigger text DEFAULT 'manual',
      status text DEFAULT 'succeeded',
      requested_start_date text,
      requested_end_date text,
      effective_start_date text,
      effective_end_date text,
      rows_written integer DEFAULT 0,
      started_at text,
      completed_at text,
      error_code text,
      error_message text,
      actor_user_id text
    );
    CREATE TABLE gsc_daily_facts (
      id text PRIMARY KEY,
      project_id text,
      source_resource_id text,
      date text,
      query text,
      page text,
      country text DEFAULT '',
      device text DEFAULT '',
      search_type text DEFAULT 'web',
      clicks real DEFAULT 0,
      impressions real DEFAULT 0,
      ctr real DEFAULT 0,
      position real DEFAULT 0,
      source_run_id text,
      created_at text,
      updated_at text
    );
    CREATE TABLE ga4_daily_landing_page_facts (
      id text PRIMARY KEY,
      project_id text,
      source_resource_id text,
      date text,
      host_name text DEFAULT 'example.com',
      landing_page text,
      channel text DEFAULT 'organic_search',
      sessions real DEFAULT 0,
      active_users real DEFAULT 0,
      engaged_sessions real DEFAULT 0,
      engagement_rate real DEFAULT 0,
      key_events real DEFAULT 0,
      transactions real DEFAULT 0,
      purchase_revenue real DEFAULT 0,
      source_run_id text,
      created_at text,
      updated_at text
    );
  `);

  ({ Page360Repository } = await import("./Page360Repository"));
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM audit_lighthouse_results;
    DELETE FROM audit_issues;
    DELETE FROM audit_pages;
    DELETE FROM audits;
    DELETE FROM action_evidence;
    DELETE FROM actions;
    DELETE FROM gsc_daily_facts;
    DELETE FROM ga4_daily_landing_page_facts;
  `);
});

describe("Page360Repository", () => {
  it("retrieves known pages across audits and gsc facts", async () => {
    await client.executeMultiple(`
      INSERT INTO audits (id, project_id, status, started_at, completed_at)
      VALUES ('audit-1', 'project-1', 'completed', '2026-09-01T00:00:00Z', '2026-09-01T00:05:00Z');

      INSERT INTO audit_pages (id, audit_id, url, status_code, title)
      VALUES ('page-1', 'audit-1', 'https://example.com/about', 200, 'About Us');

      INSERT INTO gsc_daily_facts (id, project_id, source_resource_id, date, query, page, clicks, impressions, ctr, position, source_run_id, created_at, updated_at)
      VALUES ('gsc-1', 'project-1', 'res-1', '2026-09-01', 'about', 'https://example.com/contact', 5, 20, 0.25, 2, 'run-1', 'now', 'now');
    `);

    const pages = await Page360Repository.getKnownPages("project-1");
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.url)).toContain("https://example.com/about");
    expect(pages.map((p) => p.url)).toContain("https://example.com/contact");
  });

  it("fetches audit page data, issues, and linked actions", async () => {
    await client.executeMultiple(`
      INSERT INTO audits (id, project_id, status, started_at, completed_at)
      VALUES ('audit-1', 'project-1', 'completed', '2026-09-01T00:00:00Z', '2026-09-01T00:05:00Z');

      INSERT INTO audit_pages (id, audit_id, url, status_code, title, meta_description, is_indexable, word_count)
      VALUES ('page-1', 'audit-1', 'https://example.com/product', 200, 'Super Product', 'Buy it now', 1, 450);

      INSERT INTO audit_issues (id, audit_id, page_id, page_url, issue_type, severity, details_json)
      VALUES ('issue-1', 'audit-1', 'page-1', 'https://example.com/product', 'missing-h1', 'critical', null);

      INSERT INTO actions (id, project_id, title, severity, status, issue_type)
      VALUES ('action-1', 'project-1', 'Add H1 tag', 'critical', 'open', 'missing-h1');

      INSERT INTO action_evidence (id, action_id, audit_id, url, details_json)
      VALUES ('ev-1', 'action-1', 'audit-1', 'https://example.com/product', null);
    `);

    const result = await Page360Repository.getPageAuditData(
      "project-1",
      "https://example.com/product",
    );

    expect(result.page?.title).toBe("Super Product");
    expect(result.page?.statusCode).toBe(200);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.issueType).toBe("missing-h1");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.title).toBe("Add H1 tag");
  });

  it("aggregates GSC daily queries and performance metrics", async () => {
    await client.executeMultiple(`
      INSERT INTO gsc_daily_facts (id, project_id, source_resource_id, date, query, page, clicks, impressions, ctr, position, source_run_id, created_at, updated_at)
      VALUES
        ('gsc-1', 'project-1', 'res-1', '2026-09-01', 'best widget', 'https://example.com/widget', 10, 100, 0.1, 2.0, 'run-1', 'now', 'now'),
        ('gsc-2', 'project-1', 'res-1', '2026-09-02', 'best widget', 'https://example.com/widget', 15, 100, 0.15, 1.0, 'run-1', 'now', 'now'),
        ('gsc-3', 'project-1', 'res-1', '2026-09-02', 'cheap widget', 'https://example.com/widget', 5, 50, 0.1, 4.0, 'run-1', 'now', 'now');
    `);

    const gsc = await Page360Repository.getPageGscData(
      "project-1",
      "https://example.com/widget",
    );

    expect(gsc.totals).not.toBeNull();
    expect(gsc.totals?.clicks).toBe(30);
    expect(gsc.totals?.impressions).toBe(250);
    expect(gsc.topQueries).toHaveLength(2);
    expect(gsc.topQueries[0]?.query).toBe("best widget");
    expect(gsc.topQueries[0]?.clicks).toBe(25);
  });

  it("aggregates GA4 landing page metrics", async () => {
    await client.executeMultiple(`
      INSERT INTO ga4_daily_landing_page_facts (id, project_id, source_resource_id, date, landing_page, sessions, active_users, engaged_sessions, engagement_rate, key_events, transactions, purchase_revenue, source_run_id, created_at, updated_at)
      VALUES
        ('ga-1', 'project-1', 'res-1', '2026-09-01', '/widget', 100, 90, 80, 0.8, 10, 2, 50.0, 'run-1', 'now', 'now'),
        ('ga-2', 'project-1', 'res-1', '2026-09-02', '/widget', 50, 40, 40, 0.8, 5, 1, 25.0, 'run-1', 'now', 'now');
    `);

    const ga4 = await Page360Repository.getPageGa4Data(
      "project-1",
      "https://example.com/widget",
    );

    expect(ga4.totals).not.toBeNull();
    expect(ga4.totals?.sessions).toBe(150);
    expect(ga4.totals?.activeUsers).toBe(130);
    expect(ga4.totals?.conversions).toBe(3);
    expect(ga4.totals?.purchaseRevenue).toBe(75.0);
  });
});
