CREATE TABLE `Comment` (
	`id` integer PRIMARY KEY NOT NULL,
	`postSlug` text NOT NULL,
	`author` text NOT NULL,
	`email` text,
	`content` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`parentId` integer
);
--> statement-breakpoint
CREATE INDEX `Comment_postSlug_idx` ON `Comment` (`postSlug`);--> statement-breakpoint
CREATE INDEX `Comment_approved_idx` ON `Comment` (`approved`);