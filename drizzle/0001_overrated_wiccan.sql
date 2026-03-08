CREATE TABLE `alert_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`minRoi` varchar(20) DEFAULT '5',
	`maxRisk` varchar(20) DEFAULT '15',
	`enabledSports` text,
	`enabledBookmakers` text,
	`emailNotifications` boolean NOT NULL DEFAULT true,
	`pushNotifications` boolean NOT NULL DEFAULT true,
	`alertStartTime` varchar(10),
	`alertEndTime` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alert_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `bets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`opportunityId` int,
	`bookmaker` varchar(100) NOT NULL,
	`sport` varchar(100) NOT NULL,
	`event` text NOT NULL,
	`market` varchar(200) NOT NULL,
	`outcome` text NOT NULL,
	`odds` varchar(20) NOT NULL,
	`stake` varchar(20) NOT NULL,
	`status` enum('pending','won','lost','void','cashed_out') NOT NULL DEFAULT 'pending',
	`result` varchar(20),
	`placedAt` timestamp NOT NULL DEFAULT (now()),
	`settledAt` timestamp,
	`notes` text,
	CONSTRAINT `bets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookmaker_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bookmaker` varchar(100) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`isLimited` boolean NOT NULL DEFAULT false,
	`isBanned` boolean NOT NULL DEFAULT false,
	`healthScore` int DEFAULT 100,
	`detectionRisk` enum('low','medium','high') DEFAULT 'low',
	`currentBalance` varchar(20),
	`totalDeposited` varchar(20),
	`totalWithdrawn` varchar(20),
	`accountCreatedAt` timestamp,
	`lastBetAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookmaker_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`opportunityId` int,
	`betId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('opportunity','bet_settled','account_alert','system') NOT NULL,
	`opportunityId` int,
	`betId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('arbitrage','middle','matched') NOT NULL,
	`sport` varchar(100) NOT NULL,
	`event` text NOT NULL,
	`market` varchar(200) NOT NULL,
	`bookmaker1` varchar(100) NOT NULL,
	`odds1` varchar(20) NOT NULL,
	`outcome1` text NOT NULL,
	`bookmaker2` varchar(100) NOT NULL,
	`odds2` varchar(20) NOT NULL,
	`outcome2` text NOT NULL,
	`bookmaker3` varchar(100),
	`odds3` varchar(20),
	`outcome3` text,
	`roi` varchar(20) NOT NULL,
	`riskPercentage` varchar(20),
	`recommendedStake` varchar(20) NOT NULL,
	`eventStartTime` timestamp,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	CONSTRAINT `opportunities_id` PRIMARY KEY(`id`)
);
