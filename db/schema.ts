import { sqliteTable, text, index, integer } from 'drizzle-orm/sqlite-core';
export const purchases = sqliteTable('purchases', { id:text('id').primaryKey(), userId:text('user_id').notNull(), brief:text('brief').notNull(), report:text('report'), status:text('status').notNull(), updatedAt:text('updated_at').notNull() },t=>[index('idx_purchases_user').on(t.userId)]);
export const workspace = sqliteTable('workspace', { id:text('id').primaryKey(), settings:text('settings').notNull() });
export const observations = sqliteTable('observations', { id:text('id').primaryKey(), purchaseId:text('purchase_id').notNull().references(()=>purchases.id), payload:text('payload').notNull() },t=>[index('idx_observations_purchase').on(t.purchaseId)]);
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),user:text('user').notNull(),expires:integer('expires').notNull()});
export const oauthFlows=sqliteTable('oauth_flows',{id:text('id').primaryKey(),payload:text('payload').notNull(),expires:integer('expires').notNull()});
export const notifications=sqliteTable('notifications',{id:text('id').primaryKey(),purchaseId:text('purchase_id').notNull(),payload:text('payload').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull()});

export const jobLeases=sqliteTable('job_leases',{name:text('name').primaryKey(),token:text('token').notNull(),expires:integer('expires').notNull()});
