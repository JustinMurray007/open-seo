CREATE TABLE "action_events" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"actor_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "action_events_type_check" CHECK ("action_events"."event_type" in ('status_change','note_change'))
);
--> statement-breakpoint
CREATE TABLE "action_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"source_audit_id" text NOT NULL,
	"url" text NOT NULL,
	"details_json" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"severity" text NOT NULL,
	"source" text DEFAULT 'audit' NOT NULL,
	"source_audit_id" text NOT NULL,
	"issue_type" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"affected_page_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"completed_at" text,
	"dismissed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "actions_status_check" CHECK ("actions"."status" in ('open','planned','in_progress','done','dismissed')),
	CONSTRAINT "actions_severity_check" CHECK ("actions"."severity" in ('critical','warning','info')),
	CONSTRAINT "actions_source_check" CHECK ("actions"."source" = 'audit')
);
--> statement-breakpoint
ALTER TABLE "action_events" ADD CONSTRAINT "action_events_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_evidence" ADD CONSTRAINT "action_evidence_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_evidence" ADD CONSTRAINT "action_evidence_source_audit_id_audits_id_fk" FOREIGN KEY ("source_audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_events_action_id_idx" ON "action_events" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_evidence_action_id_idx" ON "action_evidence" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_evidence_source_audit_id_idx" ON "action_evidence" USING btree ("source_audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_project_fingerprint_uidx" ON "actions" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "actions_project_status_idx" ON "actions" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "actions_source_audit_id_idx" ON "actions" USING btree ("source_audit_id");