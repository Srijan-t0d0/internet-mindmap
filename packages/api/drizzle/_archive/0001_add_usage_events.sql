CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_events_user_id_idx` ON `usage_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `usage_events_user_type_idx` ON `usage_events` (`user_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `usage_events_user_date_idx` ON `usage_events` (`user_id`,`created_at`);