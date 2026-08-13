-- AlterTable: Add ingestion tracking columns to documents
ALTER TABLE "documents" ADD COLUMN "ingestion_status" TEXT NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "documents" ADD COLUMN "ingestion_error" TEXT;
ALTER TABLE "documents" ADD COLUMN "page_count" INTEGER;
