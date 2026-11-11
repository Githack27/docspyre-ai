-- =============================================================================
-- 000_init_schema.sql
-- Complete declarative initial schema for DocSpyre desktop database.
-- Fully idempotent: safe to execute on fresh databases or re-run on existing ones.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'USER_REGISTERED', 'USER_LOGIN', 'USER_LOGIN_FAILED',
    'USER_LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'DOCUMENT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'DOWNLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 1. Users ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL UNIQUE,
  "email_normalized" varchar(255) NOT NULL UNIQUE,
  "password_hash" varchar(255) NOT NULL,
  "first_name" varchar(100),
  "last_name" varchar(100),
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "email_verified_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("status");
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users" ("deleted_at");

-- ─── 2. Sessions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token_hash" varchar(255) NOT NULL UNIQUE,
  "user_agent" varchar(512),
  "ip_address" varchar(45),
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "replaced_by_session_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");

-- ─── 3. Workspaces ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "owner_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "workspaces_owner_id_idx" ON "workspaces" ("owner_id");
CREATE INDEX IF NOT EXISTS "workspaces_deleted_at_idx" ON "workspaces" ("deleted_at");

-- ─── 4. Workspace Members ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_members_workspace_user_unique" UNIQUE ("workspace_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" ON "workspace_members" ("user_id");

-- ─── 5. Documents ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(500) NOT NULL,
  "storage_key" varchar(500) NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
  "size_bytes" integer NOT NULL,
  "ingestion_status" varchar(50) NOT NULL DEFAULT 'QUEUED',
  "ingestion_error" text,
  "page_count" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "documents_owner_id_idx" ON "documents" ("owner_id");
CREATE INDEX IF NOT EXISTS "documents_kind_idx" ON "documents" ("kind");
CREATE INDEX IF NOT EXISTS "documents_deleted_at_idx" ON "documents" ("deleted_at");

-- ─── 6. Workspace Files ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workspace_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "uploaded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "name" varchar(500) NOT NULL,
  "kind" varchar(100),
  "size_bytes" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "workspace_files_workspace_id_idx" ON "workspace_files" ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_files_document_id_idx" ON "workspace_files" ("document_id");
CREATE INDEX IF NOT EXISTS "workspace_files_deleted_at_idx" ON "workspace_files" ("deleted_at");

-- ─── 7. Document Shares ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "shared_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "shared_with_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_shares_document_shared_with_unique" UNIQUE ("document_id", "shared_with_id")
);

CREATE INDEX IF NOT EXISTS "document_shares_shared_with_id_idx" ON "document_shares" ("shared_with_id");
CREATE INDEX IF NOT EXISTS "document_shares_shared_by_id_idx" ON "document_shares" ("shared_by_id");

-- ─── 8. Document Chunks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "chunk_id" varchar(255) NOT NULL,
  "parent_chunk_id" varchar(255),
  "page" integer NOT NULL,
  "section_path" text[] NOT NULL DEFAULT '{}',
  "bbox" real[] NOT NULL DEFAULT '{}',
  "chunk_type" varchar(50) NOT NULL,
  "text" text NOT NULL,
  "embedding" real[] NOT NULL DEFAULT '{}',
  "keywords" text[] NOT NULL DEFAULT '{}',
  "embedding_model" varchar(128),
  "embedding_dim" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "document_chunks_document_id_idx" ON "document_chunks" ("document_id");
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_model_idx" ON "document_chunks" ("embedding_model");

-- ─── 9. Chat Sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(500) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "workspace_file_id" uuid REFERENCES "workspace_files"("id") ON DELETE SET NULL,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "previous_session_id" uuid REFERENCES "chat_sessions"("id") ON DELETE SET NULL,
  "initial_summary" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_workspace_id_idx" ON "chat_sessions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_document_id_idx" ON "chat_sessions" ("document_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_workspace_file_id_idx" ON "chat_sessions" ("workspace_file_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_previous_session_id_idx" ON "chat_sessions" ("previous_session_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_deleted_at_idx" ON "chat_sessions" ("deleted_at");

-- ─── 10. Chat Messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "sender_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "role" varchar(20) NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_messages_session_id_idx" ON "chat_messages" ("session_id");
CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages" ("created_at");

-- ─── 11. Agent Runs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "query_hash" varchar(64) NOT NULL,
  "query" text NOT NULL,
  "route" varchar(32) NOT NULL,
  "answer" text NOT NULL DEFAULT '',
  "citations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tool_calls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "verification" jsonb,
  "retrieved_chunk_ids" text[] NOT NULL DEFAULT '{}',
  "sql_query" text,
  "sql_row_count" integer,
  "provider" varchar(64),
  "model" varchar(128),
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "latency_ms" integer,
  "status" varchar(16) NOT NULL DEFAULT 'SUCCESS',
  "error" text,
  "served_from_cache" boolean NOT NULL DEFAULT false,
  "cacheable" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_runs_session_id_idx" ON "agent_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "agent_runs_user_id_idx" ON "agent_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "agent_runs_document_id_idx" ON "agent_runs" ("document_id");
CREATE INDEX IF NOT EXISTS "agent_runs_query_hash_idx" ON "agent_runs" ("query_hash");
CREATE INDEX IF NOT EXISTS "agent_runs_created_at_idx" ON "agent_runs" ("created_at");

-- ─── 12. Document Summaries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "scope" varchar(16) NOT NULL DEFAULT 'DOCUMENT',
  "scope_key" varchar(512) NOT NULL DEFAULT '',
  "section_path" text[] NOT NULL DEFAULT '{}',
  "page" integer,
  "summary" text NOT NULL,
  "key_points" text[] NOT NULL DEFAULT '{}',
  "entities" text[] NOT NULL DEFAULT '{}',
  "token_count" integer,
  "model" varchar(128),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "document_summaries_doc_scope_key_unique" UNIQUE ("document_id", "scope", "scope_key")
);

CREATE INDEX IF NOT EXISTS "document_summaries_document_id_idx" ON "document_summaries" ("document_id");
CREATE INDEX IF NOT EXISTS "document_summaries_scope_idx" ON "document_summaries" ("scope");

-- ─── 13. Conversation Summaries ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "conversation_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "through_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "message_count" integer NOT NULL DEFAULT 0,
  "token_count" integer,
  "model" varchar(128),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_summaries_session_unique" UNIQUE ("session_id")
);

-- ─── 14. Document Notes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "title" varchar(500) NOT NULL,
  "subtitle" text,
  "format" varchar(32) NOT NULL DEFAULT 'manual',
  "content" text NOT NULL,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "document_notes_document_id_idx" ON "document_notes" ("document_id");
CREATE INDEX IF NOT EXISTS "document_notes_user_id_idx" ON "document_notes" ("user_id");
CREATE INDEX IF NOT EXISTS "document_notes_created_at_idx" ON "document_notes" ("created_at");

-- ─── 15. Summarizer Memory ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "summarizer_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "context_ref" varchar(64) NOT NULL,
  "outline" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "extracted_facts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "retrieved_chunk_ids" text[] NOT NULL DEFAULT '{}',
  "memory_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "user_items" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "summarizer_memory_document_id_idx" ON "summarizer_memory" ("document_id");
CREATE INDEX IF NOT EXISTS "summarizer_memory_context_ref_idx" ON "summarizer_memory" ("context_ref");

-- ─── 16. Provider Configs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "provider_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider_id" varchar(100) NOT NULL,
  "provider_name" varchar(100) NOT NULL,
  "model" varchar(255) NOT NULL,
  "encrypted_key" text NOT NULL,
  "encrypted_prompt" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "provider_configs_user_id_idx" ON "provider_configs" ("user_id");

-- ─── 17. Audit Logs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" "AuditAction" NOT NULL,
  "ip_address" varchar(45),
  "user_agent" varchar(512),
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");

-- ─── 18. Dataset Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dataset_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "table_name" varchar(128) NOT NULL,
  "source_format" varchar(16) NOT NULL,
  "sheet_name" varchar(255),
  "columns" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "row_count" bigint,
  "sample_rows" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dataset_tables_document_table_unique" UNIQUE ("document_id", "table_name")
);

CREATE INDEX IF NOT EXISTS "dataset_tables_document_id_idx" ON "dataset_tables" ("document_id");

-- ─── 19. Dataset Queries ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dataset_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "sql" text NOT NULL,
  "outcome" varchar(16) NOT NULL,
  "row_count" integer,
  "duration_ms" integer,
  "error" text,
  "attempt" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dataset_queries_document_id_idx" ON "dataset_queries" ("document_id");
CREATE INDEX IF NOT EXISTS "dataset_queries_created_at_idx" ON "dataset_queries" ("created_at");

