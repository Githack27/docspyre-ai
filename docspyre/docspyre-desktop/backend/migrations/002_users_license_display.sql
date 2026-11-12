-- =============================================================================
-- 002_users_license_display.sql
-- The license's display name and its own end date, shown as "<name> · <N> days". license_expires_at stays the
-- token lifetime that gates requests. Both new columns are filled from the license token at the next sign-in.
-- =============================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "license_name" varchar(80),
  ADD COLUMN IF NOT EXISTS "license_ends_at" timestamp with time zone;
