CREATE TABLE "connector_sync_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"source_resource_id" text NOT NULL,
	"last_attempt_at" text,
	"last_success_at" text,
	"last_complete_date" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"next_retry_at" text,
	"retryable" boolean DEFAULT true NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "connector_sync_cursors_provider_check" CHECK ("connector_sync_cursors"."provider" in ('gsc','ga4')),
	CONSTRAINT "connector_sync_cursors_failures_check" CHECK ("connector_sync_cursors"."consecutive_failures" >= 0),
	CONSTRAINT "connector_sync_cursors_retryable_check" CHECK ("connector_sync_cursors"."retryable" in (true,false))
);
--> statement-breakpoint
CREATE TABLE "connector_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"source_resource_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"requested_start_date" text,
	"requested_end_date" text,
	"effective_start_date" text NOT NULL,
	"effective_end_date" text NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text,
	"error_code" text,
	"error_message" text,
	"actor_user_id" text,
	CONSTRAINT "connector_sync_runs_provider_check" CHECK ("connector_sync_runs"."provider" in ('gsc','ga4')),
	CONSTRAINT "connector_sync_runs_trigger_check" CHECK ("connector_sync_runs"."trigger" in ('manual','scheduled','connection')),
	CONSTRAINT "connector_sync_runs_status_check" CHECK ("connector_sync_runs"."status" in ('running','succeeded','failed')),
	CONSTRAINT "connector_sync_runs_rows_written_check" CHECK ("connector_sync_runs"."rows_written" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ga4_daily_landing_page_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_resource_id" text NOT NULL,
	"date" text NOT NULL,
	"host_name" text DEFAULT '' NOT NULL,
	"landing_page" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'organic_search' NOT NULL,
	"sessions" double precision DEFAULT 0 NOT NULL,
	"active_users" double precision DEFAULT 0 NOT NULL,
	"engaged_sessions" double precision DEFAULT 0 NOT NULL,
	"engagement_rate" double precision DEFAULT 0 NOT NULL,
	"key_events" double precision DEFAULT 0 NOT NULL,
	"transactions" double precision DEFAULT 0 NOT NULL,
	"purchase_revenue" double precision DEFAULT 0 NOT NULL,
	"source_run_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "ga4_daily_landing_page_facts_sessions_check" CHECK ("ga4_daily_landing_page_facts"."sessions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_active_users_check" CHECK ("ga4_daily_landing_page_facts"."active_users" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_engaged_sessions_check" CHECK ("ga4_daily_landing_page_facts"."engaged_sessions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_engagement_rate_check" CHECK ("ga4_daily_landing_page_facts"."engagement_rate" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_key_events_check" CHECK ("ga4_daily_landing_page_facts"."key_events" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_transactions_check" CHECK ("ga4_daily_landing_page_facts"."transactions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_revenue_check" CHECK ("ga4_daily_landing_page_facts"."purchase_revenue" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gsc_daily_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_resource_id" text NOT NULL,
	"date" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"search_type" text DEFAULT 'web' NOT NULL,
	"clicks" double precision DEFAULT 0 NOT NULL,
	"impressions" double precision DEFAULT 0 NOT NULL,
	"ctr" double precision DEFAULT 0 NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"source_run_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "gsc_daily_facts_clicks_check" CHECK ("gsc_daily_facts"."clicks" >= 0),
	CONSTRAINT "gsc_daily_facts_impressions_check" CHECK ("gsc_daily_facts"."impressions" >= 0),
	CONSTRAINT "gsc_daily_facts_ctr_check" CHECK ("gsc_daily_facts"."ctr" >= 0),
	CONSTRAINT "gsc_daily_facts_position_check" CHECK ("gsc_daily_facts"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "connector_sync_cursors" ADD CONSTRAINT "connector_sync_cursors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga4_daily_landing_page_facts" ADD CONSTRAINT "ga4_daily_landing_page_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga4_daily_landing_page_facts" ADD CONSTRAINT "ga4_daily_landing_page_facts_source_run_id_connector_sync_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."connector_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_daily_facts" ADD CONSTRAINT "gsc_daily_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_daily_facts" ADD CONSTRAINT "gsc_daily_facts_source_run_id_connector_sync_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."connector_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connector_sync_cursors_project_provider_uidx" ON "connector_sync_cursors" USING btree ("project_id","provider");--> statement-breakpoint
CREATE INDEX "connector_sync_cursors_provider_retry_idx" ON "connector_sync_cursors" USING btree ("provider","next_retry_at");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_project_provider_started_idx" ON "connector_sync_runs" USING btree ("project_id","provider","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_sync_runs_one_running_uidx" ON "connector_sync_runs" USING btree ("project_id","provider") WHERE "connector_sync_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "ga4_daily_landing_page_facts_natural_uidx" ON "ga4_daily_landing_page_facts" USING btree ("project_id","source_resource_id","date","host_name","landing_page","channel");--> statement-breakpoint
CREATE INDEX "ga4_daily_landing_page_facts_project_date_idx" ON "ga4_daily_landing_page_facts" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "ga4_daily_landing_page_facts_source_run_idx" ON "ga4_daily_landing_page_facts" USING btree ("source_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_daily_facts_natural_uidx" ON "gsc_daily_facts" USING btree ("project_id","source_resource_id","date","query","page","country","device","search_type");--> statement-breakpoint
CREATE INDEX "gsc_daily_facts_project_date_idx" ON "gsc_daily_facts" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "gsc_daily_facts_source_run_idx" ON "gsc_daily_facts" USING btree ("source_run_id");