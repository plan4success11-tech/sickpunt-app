CREATE TABLE `ingestion_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` varchar(64) NOT NULL,
	`module` varchar(32) NOT NULL,
	`status` enum('success','failure','skipped') NOT NULL,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp NOT NULL DEFAULT (now()),
	`rows_extracted` int NOT NULL DEFAULT 0,
	`rows_written` int NOT NULL DEFAULT 0,
	`error_summary` text,
	`page_verified` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ingestion_runs_id` PRIMARY KEY(`id`)
);
