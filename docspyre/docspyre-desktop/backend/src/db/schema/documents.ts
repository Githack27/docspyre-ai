import {
  pgTable, uuid, varchar, integer, timestamp, index, unique, text, real,
} from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { documentKindEnum, sharePermissionEnum } from './enums';
import { users } from './users';
import { workspaces } from './workspaces';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 500 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    kind: documentKindEnum('kind').notNull().default('OTHER'),
    sizeBytes: integer('size_bytes').notNull(),
    ingestionStatus: varchar('ingestion_status', { length: 50 }).notNull().default('QUEUED'),
    ingestionError: text('ingestion_error'),
    pageCount: integer('page_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    ownerIdIdx: index('documents_owner_id_idx').on(table.ownerId),
    kindIdx: index('documents_kind_idx').on(table.kind),
    deletedAtIdx: index('documents_deleted_at_idx').on(table.deletedAt),
  }),
);

export const workspaceFiles = pgTable(
  'workspace_files',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 500 }).notNull(),
    kind: varchar('kind', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_files_workspace_id_idx').on(table.workspaceId),
    documentIdIdx: index('workspace_files_document_id_idx').on(table.documentId),
    deletedAtIdx: index('workspace_files_deleted_at_idx').on(table.deletedAt),
  }),
);

export const documentShares = pgTable(
  'document_shares',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    sharedById: uuid('shared_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sharedWithId: uuid('shared_with_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    permission: sharePermissionEnum('permission').notNull().default('VIEW'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    sharedWithIdIdx: index('document_shares_shared_with_id_idx').on(table.sharedWithId),
    sharedByIdIdx: index('document_shares_shared_by_id_idx').on(table.sharedById),
    documentSharedWithUnique: unique('document_shares_document_shared_with_unique').on(
      table.documentId,
      table.sharedWithId,
    ),
  }),
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    chunkId: varchar('chunk_id', { length: 255 }).notNull(),
    parentChunkId: varchar('parent_chunk_id', { length: 255 }),
    page: integer('page').notNull(),
    sectionPath: text('section_path').array().notNull().default([]),
    bbox: real('bbox').array().notNull().default([]),
    chunkType: varchar('chunk_type', { length: 50 }).notNull(),
    text: text('text').notNull(),
    embedding: real('embedding').array().notNull().default([]),
    keywords: text('keywords').array().notNull().default([]),
    /**
     * Which embedding model produced `embedding`. Dense similarity is only
     * valid between vectors from the same model, so the retriever matches on
     * this and degrades to lexical-only scoring when it cannot.
     */
    embeddingModel: varchar('embedding_model', { length: 128 }),
    embeddingDim: integer('embedding_dim'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    documentIdIdx: index('document_chunks_document_id_idx').on(table.documentId),
    embeddingModelIdx: index('document_chunks_embedding_model_idx').on(table.embeddingModel),
  }),
);
