import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { users } from './users';
import { workspaces } from './workspaces';
import { documents } from './documents';
import { chatSessions, chatMessages } from './chat';

/**
 * One row per agent invocation. Doubles as a durable result store and as the
 * semantic cache: `queryHash` is a stable hash of (normalised query + scope),
 * so a repeat question can be served from here instead of re-running the graph.
 */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Assistant message this run produced, once persisted. */
    messageId: uuid('message_id').references(() => chatMessages.id, { onDelete: 'set null' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),

    /** Stable hash of the normalised question plus retrieval scope. */
    queryHash: varchar('query_hash', { length: 64 }).notNull(),
    query: text('query').notNull(),

    /** Branch the router selected: document_qa | dataset_query | summarize | smalltalk. */
    route: varchar('route', { length: 32 }).notNull(),
    answer: text('answer').notNull().default(''),

    /** Ordered citation objects surfaced to the client. */
    citations: jsonb('citations').notNull().default([]),
    /** Tool invocations with their arguments and truncated results. */
    toolCalls: jsonb('tool_calls').notNull().default([]),
    /** Grounding/claim verification payload. */
    verification: jsonb('verification'),

    /** Chunk ids used as grounding context. */
    retrievedChunkIds: text('retrieved_chunk_ids').array().notNull().default([]),

    /** Text-to-SQL details when the dataset branch ran. */
    sqlQuery: text('sql_query'),
    sqlRowCount: integer('sql_row_count'),

    provider: varchar('provider', { length: 64 }),
    model: varchar('model', { length: 128 }),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    latencyMs: integer('latency_ms'),

    /** SUCCESS | PARTIAL | FAILED */
    status: varchar('status', { length: 16 }).notNull().default('SUCCESS'),
    error: text('error'),
    /** True when the answer was replayed from a previous run. */
    servedFromCache: boolean('served_from_cache').notNull().default(false),
    /** Only cacheable runs are eligible for replay (grounded, non-degraded). */
    cacheable: boolean('cacheable').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    sessionIdIdx: index('agent_runs_session_id_idx').on(table.sessionId),
    userIdIdx: index('agent_runs_user_id_idx').on(table.userId),
    documentIdIdx: index('agent_runs_document_id_idx').on(table.documentId),
    queryHashIdx: index('agent_runs_query_hash_idx').on(table.queryHash),
    createdAtIdx: index('agent_runs_created_at_idx').on(table.createdAt),
  }),
);

/**
 * Pre-computed summaries produced at ingest time. These keep prompts small:
 * the agent reads a document-level summary instead of stuffing every chunk,
 * and falls back to section summaries for mid-granularity questions.
 */
export const documentSummaries = pgTable(
  'document_summaries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** DOCUMENT | SECTION */
    scope: varchar('scope', { length: 16 }).notNull().default('DOCUMENT'),
    /** Stable key for the summarised unit ('' for document scope). */
    scopeKey: varchar('scope_key', { length: 512 }).notNull().default(''),
    sectionPath: text('section_path').array().notNull().default([]),
    page: integer('page'),

    summary: text('summary').notNull(),
    keyPoints: text('key_points').array().notNull().default([]),
    entities: text('entities').array().notNull().default([]),

    tokenCount: integer('token_count'),
    model: varchar('model', { length: 128 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    docScopeKeyUnique: unique('document_summaries_doc_scope_key_unique').on(
      table.documentId,
      table.scope,
      table.scopeKey,
    ),
    documentIdIdx: index('document_summaries_document_id_idx').on(table.documentId),
    scopeIdx: index('document_summaries_scope_idx').on(table.scope),
  }),
);

/**
 * Rolling summary of a chat session. Older turns are folded into `summary`
 * so the prompt carries bounded history no matter how long the chat gets.
 */
export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    /** Last message folded into the summary; newer turns are sent verbatim. */
    throughMessageId: uuid('through_message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),
    messageCount: integer('message_count').notNull().default(0),
    tokenCount: integer('token_count'),
    model: varchar('model', { length: 128 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    sessionUnique: unique('conversation_summaries_session_unique').on(table.sessionId),
  }),
);
