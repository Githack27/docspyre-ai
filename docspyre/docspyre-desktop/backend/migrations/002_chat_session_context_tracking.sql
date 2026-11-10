-- =============================================================================
-- 002: Chat session context tracking, 2M token restriction, session chaining
-- =============================================================================

ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "total_tokens" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "previous_session_id" uuid REFERENCES "chat_sessions"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "initial_summary" text;

CREATE INDEX IF NOT EXISTS "chat_sessions_previous_session_id_idx"
  ON "chat_sessions" ("previous_session_id");
