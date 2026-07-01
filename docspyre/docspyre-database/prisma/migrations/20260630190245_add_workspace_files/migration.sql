-- CreateTable
CREATE TABLE "workspace_files" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspace_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_files_workspace_id_idx" ON "workspace_files"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_files_deleted_at_idx" ON "workspace_files"("deleted_at");

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
