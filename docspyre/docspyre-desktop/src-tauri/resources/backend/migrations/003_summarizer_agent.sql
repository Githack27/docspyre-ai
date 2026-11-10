-- =============================================================================
-- 003: Summarizer Agent - Document Notes and Agent Memory Snapshot
-- =============================================================================
-- Additive: creates document_notes and summarizer_memory tables with cascade deletes.
-- Drops nothing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "document_notes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "title" varchar(500) NOT NULL,
  "subtitle" text,
  "format" varchar(32) DEFAULT 'manual' NOT NULL,
  "content" text NOT NULL,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "images" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "document_notes_document_id_idx"
  ON "document_notes" ("document_id");

CREATE INDEX IF NOT EXISTS "document_notes_user_id_idx"
  ON "document_notes" ("user_id");

CREATE INDEX IF NOT EXISTS "document_notes_created_at_idx"
  ON "document_notes" ("created_at");

CREATE TABLE IF NOT EXISTS "summarizer_memory" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "context_ref" varchar(64) NOT NULL,
  "outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "extracted_facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retrieved_chunk_ids" text[] DEFAULT '{}' NOT NULL,
  "memory_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "user_items" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "summarizer_memory_document_id_idx"
  ON "summarizer_memory" ("document_id");

CREATE INDEX IF NOT EXISTS "summarizer_memory_context_ref_idx"
  ON "summarizer_memory" ("context_ref");
