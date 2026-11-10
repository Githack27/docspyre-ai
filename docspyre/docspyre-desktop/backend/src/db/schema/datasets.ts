import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { documents } from './documents';

/**
 * Schema catalogue for uploads that are really data sources (CSV, Excel,
 * Parquet, JSON, SQLite/DuckDB files). DuckDB reads the file directly at query
 * time; this table stores the profile the agent needs to write correct SQL
 * without ever loading the data into Postgres.
 */
export const datasetTables = pgTable(
  'dataset_tables',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    /** Identifier the agent uses in SQL (safe, quoted view name). */
    tableName: varchar('table_name', { length: 128 }).notNull(),
    /** CSV | TSV | XLSX | JSON | PARQUET | SQLITE | DUCKDB */
    sourceFormat: varchar('source_format', { length: 16 }).notNull(),
    /** Worksheet name for spreadsheet sources, or origin table for DB files. */
    sheetName: varchar('sheet_name', { length: 255 }),

    /** [{ name, type, nullable, distinctCount?, sampleValues[] }] */
    columns: jsonb('columns').notNull().default([]),
    rowCount: bigint('row_count', { mode: 'number' }),
    /** Small head sample used for few-shot grounding in the SQL prompt. */
    sampleRows: jsonb('sample_rows').notNull().default([]),
    /** Natural-language description of the table, generated at profile time. */
    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    documentTableUnique: unique('dataset_tables_document_table_unique').on(
      table.documentId,
      table.tableName,
    ),
    documentIdIdx: index('dataset_tables_document_id_idx').on(table.documentId),
  }),
);

/**
 * Audit trail of SQL the agent generated and executed against a dataset.
 * Useful for debugging bad text-to-SQL and for showing the user what ran.
 */
export const datasetQueries = pgTable(
  'dataset_queries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    sql: text('sql').notNull(),
    /** OK | REJECTED | ERROR */
    outcome: varchar('outcome', { length: 16 }).notNull(),
    rowCount: integer('row_count'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    attempt: integer('attempt').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    documentIdIdx: index('dataset_queries_document_id_idx').on(table.documentId),
    createdAtIdx: index('dataset_queries_created_at_idx').on(table.createdAt),
  }),
);
