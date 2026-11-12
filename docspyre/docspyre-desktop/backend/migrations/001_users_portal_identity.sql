-- =============================================================================
-- 001_users_portal_identity.sql
-- Databases created before the License Portal sign-in lack the portal identity columns on
-- "users" (000 only creates the table when missing). Idempotent: a no-op on current databases.
-- =============================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "username" varchar(100),
  ADD COLUMN IF NOT EXISTS "portal_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "first_name" varchar(60),
  ADD COLUMN IF NOT EXISTS "last_name" varchar(60),
  ADD COLUMN IF NOT EXISTS "company_name" varchar(120),
  ADD COLUMN IF NOT EXISTS "country" varchar(2),
  ADD COLUMN IF NOT EXISTS "state" varchar(120),
  ADD COLUMN IF NOT EXISTS "license_id" uuid,
  ADD COLUMN IF NOT EXISTS "license_type" varchar(30),
  ADD COLUMN IF NOT EXISTS "license_billing" varchar(20),
  ADD COLUMN IF NOT EXISTS "license_token" text,
  ADD COLUMN IF NOT EXISTS "license_expires_at" timestamp with time zone;

-- Portal accounts have no local password.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users" ("username");
CREATE UNIQUE INDEX IF NOT EXISTS "users_portal_user_id_key" ON "users" ("portal_user_id");
CREATE INDEX IF NOT EXISTS "users_portal_user_id_idx" ON "users" ("portal_user_id");
