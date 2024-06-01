CREATE TABLE `blobs` (
	`oid` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blobs_to_branches` (
	`org_name` text NOT NULL,
	`repo_name` text NOT NULL,
	`branch_name` text NOT NULL,
	`blob_oid` text NOT NULL,
	`path` text NOT NULL,
	`directory` text NOT NULL,
	FOREIGN KEY (`blob_oid`) REFERENCES `blobs`(`oid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_name`,`repo_name`,`branch_name`) REFERENCES `branches`(`org_name`,`repo_name`,`branch_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`org_name` text NOT NULL,
	`repo_name` text NOT NULL,
	`branch_name` text NOT NULL,
	`commit_oid` text NOT NULL,
	PRIMARY KEY(`branch_name`, `org_name`, `repo_name`),
	FOREIGN KEY (`commit_oid`) REFERENCES `commits`(`oid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_name`,`repo_name`) REFERENCES `repos`(`org_name`,`repo_name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commits` (
	`oid` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`tree` text NOT NULL,
	`parent` text,
	`second_parent` text
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`org_name` text NOT NULL,
	`repo_name` text NOT NULL,
	`remote_source` text NOT NULL,
	PRIMARY KEY(`org_name`, `repo_name`)
);
