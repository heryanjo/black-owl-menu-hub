CREATE TABLE `menus` (
 `id` text PRIMARY KEY NOT NULL,
 `name` text NOT NULL,
 `category` text NOT NULL,
 `description` text DEFAULT '' NOT NULL,
 `price` integer,
 `image` text DEFAULT '' NOT NULL,
 `status` text DEFAULT 'Aktif' NOT NULL,
 `outlets` text NOT NULL,
 `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
 `key` text PRIMARY KEY NOT NULL,
 `value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outlets` (
 `id` integer PRIMARY KEY NOT NULL,
 `name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `updates` (
 `id` text PRIMARY KEY NOT NULL,
 `menu_id` text NOT NULL,
 `menu_name` text NOT NULL,
 `type` text NOT NULL,
 `note` text DEFAULT '' NOT NULL,
 `changes` text NOT NULL,
 `created_at` text NOT NULL,
 `outlets` text NOT NULL,
 FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE no action
);
