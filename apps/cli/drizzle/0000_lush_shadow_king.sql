CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`resources` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_questions_thread` ON `questions` (`thread_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
