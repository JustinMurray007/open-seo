CREATE TABLE `connector_sync_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_resource_id` text NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_complete_date` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`next_retry_at` text,
	`retryable` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connector_sync_cursors_provider_check" CHECK("connector_sync_cursors"."provider" in ('gsc','ga4')),
	CONSTRAINT "connector_sync_cursors_failures_check" CHECK("connector_sync_cursors"."consecutive_failures" >= 0),
	CONSTRAINT "connector_sync_cursors_retryable_check" CHECK("connector_sync_cursors"."retryable" in (true,false))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connector_sync_cursors_project_provider_uidx` ON `connector_sync_cursors` (`project_id`,`provider`);--> statement-breakpoint
CREATE INDEX `connector_sync_cursors_provider_retry_idx` ON `connector_sync_cursors` (`provider`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `connector_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_resource_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`requested_start_date` text,
	`requested_end_date` text,
	`effective_start_date` text NOT NULL,
	`effective_end_date` text NOT NULL,
	`rows_written` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_code` text,
	`error_message` text,
	`actor_user_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connector_sync_runs_provider_check" CHECK("connector_sync_runs"."provider" in ('gsc','ga4')),
	CONSTRAINT "connector_sync_runs_trigger_check" CHECK("connector_sync_runs"."trigger" in ('manual','scheduled','connection')),
	CONSTRAINT "connector_sync_runs_status_check" CHECK("connector_sync_runs"."status" in ('running','succeeded','failed')),
	CONSTRAINT "connector_sync_runs_rows_written_check" CHECK("connector_sync_runs"."rows_written" >= 0)
);
--> statement-breakpoint
CREATE INDEX `connector_sync_runs_project_provider_started_idx` ON `connector_sync_runs` (`project_id`,`provider`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `connector_sync_runs_one_running_uidx` ON `connector_sync_runs` (`project_id`,`provider`) WHERE "connector_sync_runs"."status" = 'running';--> statement-breakpoint
CREATE TABLE `ga4_daily_landing_page_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_resource_id` text NOT NULL,
	`date` text NOT NULL,
	`host_name` text DEFAULT '' NOT NULL,
	`landing_page` text DEFAULT '' NOT NULL,
	`channel` text DEFAULT 'organic_search' NOT NULL,
	`sessions` real DEFAULT 0 NOT NULL,
	`active_users` real DEFAULT 0 NOT NULL,
	`engaged_sessions` real DEFAULT 0 NOT NULL,
	`engagement_rate` real DEFAULT 0 NOT NULL,
	`key_events` real DEFAULT 0 NOT NULL,
	`transactions` real DEFAULT 0 NOT NULL,
	`purchase_revenue` real DEFAULT 0 NOT NULL,
	`source_run_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_run_id`) REFERENCES `connector_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ga4_daily_landing_page_facts_sessions_check" CHECK("ga4_daily_landing_page_facts"."sessions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_active_users_check" CHECK("ga4_daily_landing_page_facts"."active_users" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_engaged_sessions_check" CHECK("ga4_daily_landing_page_facts"."engaged_sessions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_engagement_rate_check" CHECK("ga4_daily_landing_page_facts"."engagement_rate" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_key_events_check" CHECK("ga4_daily_landing_page_facts"."key_events" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_transactions_check" CHECK("ga4_daily_landing_page_facts"."transactions" >= 0),
	CONSTRAINT "ga4_daily_landing_page_facts_revenue_check" CHECK("ga4_daily_landing_page_facts"."purchase_revenue" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ga4_daily_landing_page_facts_natural_uidx` ON `ga4_daily_landing_page_facts` (`project_id`,`source_resource_id`,`date`,`host_name`,`landing_page`,`channel`);--> statement-breakpoint
CREATE INDEX `ga4_daily_landing_page_facts_project_date_idx` ON `ga4_daily_landing_page_facts` (`project_id`,`date`);--> statement-breakpoint
CREATE INDEX `ga4_daily_landing_page_facts_source_run_idx` ON `ga4_daily_landing_page_facts` (`source_run_id`);--> statement-breakpoint
CREATE TABLE `gsc_daily_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_resource_id` text NOT NULL,
	`date` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`page` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`search_type` text DEFAULT 'web' NOT NULL,
	`clicks` real DEFAULT 0 NOT NULL,
	`impressions` real DEFAULT 0 NOT NULL,
	`ctr` real DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`source_run_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_run_id`) REFERENCES `connector_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "gsc_daily_facts_clicks_check" CHECK("gsc_daily_facts"."clicks" >= 0),
	CONSTRAINT "gsc_daily_facts_impressions_check" CHECK("gsc_daily_facts"."impressions" >= 0),
	CONSTRAINT "gsc_daily_facts_ctr_check" CHECK("gsc_daily_facts"."ctr" >= 0),
	CONSTRAINT "gsc_daily_facts_position_check" CHECK("gsc_daily_facts"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gsc_daily_facts_natural_uidx` ON `gsc_daily_facts` (`project_id`,`source_resource_id`,`date`,`query`,`page`,`country`,`device`,`search_type`);--> statement-breakpoint
CREATE INDEX `gsc_daily_facts_project_date_idx` ON `gsc_daily_facts` (`project_id`,`date`);--> statement-breakpoint
CREATE INDEX `gsc_daily_facts_source_run_idx` ON `gsc_daily_facts` (`source_run_id`);