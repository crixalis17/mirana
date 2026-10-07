CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`brief` text NOT NULL,
	`report` text,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL
);
