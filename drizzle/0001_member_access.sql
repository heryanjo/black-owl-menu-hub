CREATE TABLE `admin_members` (
 `id` text PRIMARY KEY NOT NULL,
 `email` text NOT NULL UNIQUE,
 `display_name` text NOT NULL,
 `role` text NOT NULL,
 `pin_hash` text NOT NULL,
 `pin_salt` text NOT NULL,
 `active` integer DEFAULT 1 NOT NULL,
 `auth_version` integer DEFAULT 1 NOT NULL,
 `created_at` text NOT NULL,
 `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
 `token_hash` text PRIMARY KEY NOT NULL,
 `member_id` text NOT NULL REFERENCES `admin_members`(`id`),
 `auth_version` integer NOT NULL,
 `created_at` integer NOT NULL,
 `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_member_idx` ON `admin_sessions` (`member_id`);
--> statement-breakpoint
CREATE INDEX `admin_sessions_expiry_idx` ON `admin_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `auth_attempts` (
 `key` text PRIMARY KEY NOT NULL,
 `attempts` integer DEFAULT 0 NOT NULL,
 `window_start` integer NOT NULL
);
