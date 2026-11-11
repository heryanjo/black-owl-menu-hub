import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const menus = sqliteTable('menus', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull().default(''),
  description: text('description').notNull().default(''),
  price: integer('price'),
  image: text('image').notNull().default(''),
  status: text('status').notNull().default('Aktif'),
  outlets: text('outlets').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const updates = sqliteTable('updates', {
  id: text('id').primaryKey(),
  menuId: text('menu_id').notNull().references(() => menus.id),
  menuName: text('menu_name').notNull(),
  type: text('type').notNull(),
  note: text('note').notNull().default(''),
  changes: text('changes').notNull(),
  createdAt: text('created_at').notNull(),
  outlets: text('outlets').notNull(),
});
export const outlets = sqliteTable('outlets', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});
export const metadata = sqliteTable('metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const adminMembers = sqliteTable('admin_members', {
 id: text('id').primaryKey(), email: text('email').notNull().unique(), displayName: text('display_name').notNull(), role: text('role').notNull(),
 pinHash: text('pin_hash').notNull(), pinSalt: text('pin_salt').notNull(), active: integer('active').notNull().default(1), authVersion: integer('auth_version').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const adminSessions = sqliteTable('admin_sessions', {
 tokenHash: text('token_hash').primaryKey(), memberId: text('member_id').notNull().references(() => adminMembers.id), authVersion: integer('auth_version').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const authAttempts = sqliteTable('auth_attempts', { key: text('key').primaryKey(), attempts: integer('attempts').notNull().default(0), windowStart: integer('window_start').notNull() });
