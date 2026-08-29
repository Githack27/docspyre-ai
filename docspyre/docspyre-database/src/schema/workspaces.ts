import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { workspaceRoleEnum } from './enums';
import { users } from './users';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    ownerIdIdx: index('workspaces_owner_id_idx').on(table.ownerId),
    deletedAtIdx: index('workspaces_deleted_at_idx').on(table.deletedAt),
  }),
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('MEMBER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => ({
    workspaceUserUnique: unique('workspace_members_workspace_user_unique').on(
      table.workspaceId,
      table.userId,
    ),
    userIdIdx: index('workspace_members_user_id_idx').on(table.userId),
  }),
);
