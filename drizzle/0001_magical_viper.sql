CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `purchases` ADD `user_id` text DEFAULT 'private-owner' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_purchases_user` ON `purchases` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_observations_purchase` ON `observations` (`purchase_id`);