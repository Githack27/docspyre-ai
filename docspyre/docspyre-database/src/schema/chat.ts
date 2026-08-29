import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { users } from './users';
import { workspaces } from './workspaces';
import { documents, workspaceFiles } from './documents';

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    title: varchar('title', { length: 500 }).notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    workspaceFileId: uuid('workspace_file_id').references(() => workspaceFiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('chat_sessions_user_id_idx').on(table.userId),
    workspaceIdIdx: index('chat_sessions_workspace_id_idx').on(table.workspaceId),
    documentIdIdx: index('chat_sessions_document_id_idx').on(table.documentId),
    workspaceFileIdIdx: index('chat_sessions_workspace_file_id_idx').on(table.workspaceFileId),
    deletedAtIdx: index('chat_sessions_deleted_at_idx').on(table.deletedAt),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    sessionIdIdx: index('chat_messages_session_id_idx').on(table.sessionId),
    createdAtIdx: index('chat_messages_created_at_idx').on(table.createdAt),
  }),
);
