DROP INDEX IF EXISTS `items_url_unique`;--> statement-breakpoint
ALTER TABLE `items` ADD `user_id` text REFERENCES user(id);--> statement-breakpoint
CREATE UNIQUE INDEX `items_user_url_unique` ON `items` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `items_user_id_idx` ON `items` (`user_id`);