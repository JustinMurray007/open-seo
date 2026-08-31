import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

export const connectorSyncRuns = pgTable(
  "connector_sync_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gsc", "ga4"] }).notNull(),
    sourceResourceId: text("source_resource_id").notNull(),
    trigger: text("trigger", {
      enum: ["manual", "scheduled", "connection"],
    }).notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed"],
    })
      .notNull()
      .default("running"),
    requestedStartDate: text("requested_start_date"),
    requestedEndDate: text("requested_end_date"),
    effectiveStartDate: text("effective_start_date").notNull(),
    effectiveEndDate: text("effective_end_date").notNull(),
    rowsWritten: integer("rows_written").notNull().default(0),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    actorUserId: text("actor_user_id"),
  },
  (table) => [
    index("connector_sync_runs_project_provider_started_idx").on(
      table.projectId,
      table.provider,
      table.startedAt,
    ),
    uniqueIndex("connector_sync_runs_one_running_uidx")
      .on(table.projectId, table.provider)
      .where(sql`${table.status} = 'running'`),
    check(
      "connector_sync_runs_provider_check",
      sql`${table.provider} in ('gsc','ga4')`,
    ),
    check(
      "connector_sync_runs_trigger_check",
      sql`${table.trigger} in ('manual','scheduled','connection')`,
    ),
    check(
      "connector_sync_runs_status_check",
      sql`${table.status} in ('running','succeeded','failed')`,
    ),
    check(
      "connector_sync_runs_rows_written_check",
      sql`${table.rowsWritten} >= 0`,
    ),
  ],
);

export const connectorSyncCursors = pgTable(
  "connector_sync_cursors",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gsc", "ga4"] }).notNull(),
    sourceResourceId: text("source_resource_id").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    lastSuccessAt: text("last_success_at"),
    lastCompleteDate: text("last_complete_date"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    nextRetryAt: text("next_retry_at"),
    retryable: boolean("retryable").notNull().default(true),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("connector_sync_cursors_project_provider_uidx").on(
      table.projectId,
      table.provider,
    ),
    index("connector_sync_cursors_provider_retry_idx").on(
      table.provider,
      table.nextRetryAt,
    ),
    check(
      "connector_sync_cursors_provider_check",
      sql`${table.provider} in ('gsc','ga4')`,
    ),
    check(
      "connector_sync_cursors_failures_check",
      sql`${table.consecutiveFailures} >= 0`,
    ),
    check(
      "connector_sync_cursors_retryable_check",
      sql`${table.retryable} in (true,false)`,
    ),
  ],
);

export const gscDailyFacts = pgTable(
  "gsc_daily_facts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceResourceId: text("source_resource_id").notNull(),
    date: text("date").notNull(),
    query: text("query").notNull().default(""),
    page: text("page").notNull().default(""),
    country: text("country").notNull().default(""),
    device: text("device").notNull().default(""),
    searchType: text("search_type").notNull().default("web"),
    clicks: doublePrecision("clicks").notNull().default(0),
    impressions: doublePrecision("impressions").notNull().default(0),
    ctr: doublePrecision("ctr").notNull().default(0),
    position: doublePrecision("position").notNull().default(0),
    sourceRunId: text("source_run_id")
      .notNull()
      .references(() => connectorSyncRuns.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("gsc_daily_facts_natural_uidx").on(
      table.projectId,
      table.sourceResourceId,
      table.date,
      table.query,
      table.page,
      table.country,
      table.device,
      table.searchType,
    ),
    index("gsc_daily_facts_project_date_idx").on(table.projectId, table.date),
    index("gsc_daily_facts_source_run_idx").on(table.sourceRunId),
    check("gsc_daily_facts_clicks_check", sql`${table.clicks} >= 0`),
    check("gsc_daily_facts_impressions_check", sql`${table.impressions} >= 0`),
    check("gsc_daily_facts_ctr_check", sql`${table.ctr} >= 0`),
    check("gsc_daily_facts_position_check", sql`${table.position} >= 0`),
  ],
);

export const ga4DailyLandingPageFacts = pgTable(
  "ga4_daily_landing_page_facts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceResourceId: text("source_resource_id").notNull(),
    date: text("date").notNull(),
    hostName: text("host_name").notNull().default(""),
    landingPage: text("landing_page").notNull().default(""),
    channel: text("channel").notNull().default("organic_search"),
    sessions: doublePrecision("sessions").notNull().default(0),
    activeUsers: doublePrecision("active_users").notNull().default(0),
    engagedSessions: doublePrecision("engaged_sessions").notNull().default(0),
    engagementRate: doublePrecision("engagement_rate").notNull().default(0),
    keyEvents: doublePrecision("key_events").notNull().default(0),
    transactions: doublePrecision("transactions").notNull().default(0),
    purchaseRevenue: doublePrecision("purchase_revenue").notNull().default(0),
    sourceRunId: text("source_run_id")
      .notNull()
      .references(() => connectorSyncRuns.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ga4_daily_landing_page_facts_natural_uidx").on(
      table.projectId,
      table.sourceResourceId,
      table.date,
      table.hostName,
      table.landingPage,
      table.channel,
    ),
    index("ga4_daily_landing_page_facts_project_date_idx").on(
      table.projectId,
      table.date,
    ),
    index("ga4_daily_landing_page_facts_source_run_idx").on(table.sourceRunId),
    check(
      "ga4_daily_landing_page_facts_sessions_check",
      sql`${table.sessions} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_active_users_check",
      sql`${table.activeUsers} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_engaged_sessions_check",
      sql`${table.engagedSessions} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_engagement_rate_check",
      sql`${table.engagementRate} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_key_events_check",
      sql`${table.keyEvents} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_transactions_check",
      sql`${table.transactions} >= 0`,
    ),
    check(
      "ga4_daily_landing_page_facts_revenue_check",
      sql`${table.purchaseRevenue} >= 0`,
    ),
  ],
);
