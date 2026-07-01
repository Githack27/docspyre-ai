-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'DOWNLOAD');

-- CreateTable
CREATE TABLE "document_shares" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "shared_by_id" UUID NOT NULL,
    "shared_with_id" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_shares_shared_with_id_idx" ON "document_shares"("shared_with_id");

-- CreateIndex
CREATE INDEX "document_shares_shared_by_id_idx" ON "document_shares"("shared_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_shares_document_id_shared_with_id_key" ON "document_shares"("document_id", "shared_with_id");

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
