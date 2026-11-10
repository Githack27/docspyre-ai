-- =============================================================================
-- 001: Chat-with-document agent tables, dataset catalogue, summaries.
-- =============================================================================
-- Additive: creates only new objects; safe to re-run (guarded with IF NOT EXISTS).
-- Drops nothing.
-- =============================================================================

-- ─── document_chunks: pin vectors to the model that produced them ────────────

ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "embedding_model" varchar(128);

ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "embedding_dim" integer;

CREATE INDEX IF NOT EXISTS "document_chunks_embedding_model_idx"
  ON "document_chunks" ("embedding_model");

-- ─── document_shares: unique constraint for upsert ───────────────────────────

DO $$ BEGIN
  ALTER TABLE "document_shares"
    ADD CONSTRAINT "document_shares_document_shared_with_unique"
    UNIQUE ("document_id", "shared_with_id");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── agent_runs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "message_id" uuid,
  "document_id" uuid,
  "workspace_id" uuid,
  "query_hash" varchar(64) NOT NULL,
  "query" text NOT NULL,
  "route" varchar(32) NOT NULL,
  "answer" text DEFAULT '' NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "verification" jsonb,
  "retrieved_chunk_ids" text[] DEFAULT '{}' NOT NULL,
  "sql_query" text,
  "sql_row_count" integer,
  "provider" varchar(64),
  "model" varchar(128),
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "latency_ms" integer,
  "status" varchar(16) DEFAULT 'SUCCESS' NOT NULL,
  "error" text,
  "served_from_cache" boolean DEFAULT false NOT NULL,
  "cacheable" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_runs_session_id_idx" ON "agent_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "agent_runs_user_id_idx" ON "agent_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "agent_runs_document_id_idx" ON "agent_runs" ("document_id");
CREATE INDEX IF NOT EXISTS "agent_runs_query_hash_idx" ON "agent_runs" ("query_hash");
CREATE INDEX IF NOT EXISTS "agent_runs_created_at_idx" ON "agent_runs" ("created_at");

-- ─── document_summaries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_summaries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "scope" varchar(16) DEFAULT 'DOCUMENT' NOT NULL,
  "scope_key" varchar(512) DEFAULT '' NOT NULL,
  "section_path" text[] DEFAULT '{}' NOT NULL,
  "page" integer,
  "summary" text NOT NULL,
  "key_points" text[] DEFAULT '{}' NOT NULL,
  "entities" text[] DEFAULT '{}' NOT NULL,
  "token_count" integer,
  "model" varchar(128),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "document_summaries_doc_scope_key_unique" UNIQUE ("document_id", "scope", "scope_key")
);

CREATE INDEX IF NOT EXISTS "document_summaries_document_id_idx" ON "document_summaries" ("document_id");
CREATE INDEX IF NOT EXISTS "document_summaries_scope_idx" ON "document_summaries" ("scope");

-- ─── conversation_summaries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "conversation_summaries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL,
  "summary" text NOT NULL,
  "through_message_id" uuid,
  "message_count" integer DEFAULT 0 NOT NULL,
  "token_count" integer,
  "model" varchar(128),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "conversation_summaries_session_unique" UNIQUE ("session_id")
);

-- ─── dataset_tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dataset_tables" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "table_name" varchar(128) NOT NULL,
  "source_format" varchar(16) NOT NULL,
  "sheet_name" varchar(255),
  "columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "row_count" bigint,
  "sample_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "dataset_tables_document_table_unique" UNIQUE ("document_id", "table_name")
);

CREATE INDEX IF NOT EXISTS "dataset_tables_document_id_idx" ON "dataset_tables" ("document_id");

-- ─── dataset_queries ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dataset_queries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "question" text NOT NULL,
  "sql" text NOT NULL,
  "outcome" varchar(16) NOT NULL,
  "row_count" integer,
  "duration_ms" integer,
  "error" text,
  "attempt" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "dataset_queries_document_id_idx" ON "dataset_queries" ("document_id");
CREATE INDEX IF NOT EXISTS "dataset_queries_created_at_idx" ON "dataset_queries" ("created_at");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_message_id_fk"
    FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_document_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_summaries" ADD CONSTRAINT "document_summaries_document_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_session_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_through_message_id_fk"
    FOREIGN KEY ("through_message_id") REFERENCES "chat_messages"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dataset_tables" ADD CONSTRAINT "dataset_tables_document_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dataset_queries" ADD CONSTRAINT "dataset_queries_document_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
