import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { audits } from "./audit.schema";

export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    status: text("status", {
      enum: ["open", "planned", "in_progress", "done", "dismissed"],
    })
      .notNull()
      .default("open"),
    severity: text("severity", {
      enum: ["critical", "warning", "info"],
    }).notNull(),
    source: text("source", { enum: ["audit"] })
      .notNull()
      .default("audit"),
    sourceAuditId: text("source_audit_id").notNull(),
    issueType: text("issue_type").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    affectedPageCount: integer("affected_page_count").notNull().default(0),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    notes: text("notes").notNull().default(""),
    completedAt: text("completed_at"),
    dismissedAt: text("dismissed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("actions_project_fingerprint_uidx").on(
      table.projectId,
      table.fingerprint,
    ),
    index("actions_project_status_idx").on(table.projectId, table.status),
    index("actions_source_audit_id_idx").on(table.sourceAuditId),
    check(
      "actions_status_check",
      sql`${table.status} in ('open','planned','in_progress','done','dismissed')`,
    ),
    check(
      "actions_severity_check",
      sql`${table.severity} in ('critical','warning','info')`,
    ),
    check("actions_source_check", sql`${table.source} = 'audit'`),
  ],
);

export const actionEvidence = sqliteTable(
  "action_evidence",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    sourceAuditId: text("source_audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    detailsJson: text("details_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("action_evidence_action_id_idx").on(table.actionId),
    index("action_evidence_source_audit_id_idx").on(table.sourceAuditId),
  ],
);

export const actionEvents = sqliteTable(
  "action_events",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: ["status_change", "note_change"],
    }).notNull(),
    fromStatus: text("from_status", {
      enum: ["open", "planned", "in_progress", "done", "dismissed"],
    }),
    toStatus: text("to_status", {
      enum: ["open", "planned", "in_progress", "done", "dismissed"],
    }),
    note: text("note"),
    actorUserId: text("actor_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("action_events_action_id_idx").on(table.actionId),
    check(
      "action_events_type_check",
      sql`${table.eventType} in ('status_change','note_change')`,
    ),
  ],
);
