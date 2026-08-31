CREATE TABLE `action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`note` text,
	`actor_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "action_events_type_check" CHECK("action_events"."event_type" in ('status_change','note_change'))
);
--> statement-breakpoint
CREATE INDEX `action_events_action_id_idx` ON `action_events` (`action_id`);--> statement-breakpoint
CREATE TABLE `action_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`source_audit_id` text NOT NULL,
	`url` text NOT NULL,
	`details_json` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_evidence_action_id_idx` ON `action_evidence` (`action_id`);--> statement-breakpoint
CREATE INDEX `action_evidence_source_audit_id_idx` ON `action_evidence` (`source_audit_id`);--> statement-breakpoint
CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`severity` text NOT NULL,
	`source` text DEFAULT 'audit' NOT NULL,
	`source_audit_id` text NOT NULL,
	`issue_type` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`affected_page_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`dismissed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "actions_status_check" CHECK("actions"."status" in ('open','planned','in_progress','done','dismissed')),
	CONSTRAINT "actions_severity_check" CHECK("actions"."severity" in ('critical','warning','info')),
	CONSTRAINT "actions_source_check" CHECK("actions"."source" = 'audit')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_project_fingerprint_uidx` ON `actions` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `actions_project_status_idx` ON `actions` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `actions_source_audit_id_idx` ON `actions` (`source_audit_id`);