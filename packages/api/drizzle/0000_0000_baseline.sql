CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `apiKey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`userId` text NOT NULL,
	`refillInterval` integer,
	`refillAmount` integer,
	`lastRefillAt` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`rateLimitEnabled` integer DEFAULT false NOT NULL,
	`rateLimitTimeWindow` integer,
	`rateLimitMax` integer,
	`requestCount` integer DEFAULT 0 NOT NULL,
	`remaining` integer,
	`lastRequest` integer,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apiKey_key_unique` ON `apiKey` (`key`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`raw_content` text,
	`summary` text,
	`key_passages` text,
	`vectorize_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`last_error` text,
	`error_count` integer DEFAULT 0 NOT NULL,
	`author` text,
	`published` text,
	`description` text,
	`site_name` text,
	`notes` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_url_unique` ON `items` (`url`);--> statement-breakpoint
CREATE INDEX `items_source_type_idx` ON `items` (`source_type`);--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `items_created_at_idx` ON `items` (`created_at`);--> statement-breakpoint
CREATE INDEX `items_is_read_idx` ON `items` (`is_read`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
