-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "parent_chunk_id" TEXT,
    "page" INTEGER NOT NULL,
    "section_path" TEXT[],
    "bbox" DOUBLE PRECISION[],
    "chunk_type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "keywords" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "semantic_caches" (
    "id" UUID NOT NULL,
    "document_id" UUID,
    "workspace_id" UUID,
    "query" TEXT NOT NULL,
    "query_hash" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_caches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_caches_document_id_idx" ON "semantic_caches"("document_id");

-- CreateIndex
CREATE INDEX "semantic_caches_workspace_id_idx" ON "semantic_caches"("workspace_id");

-- CreateIndex
CREATE INDEX "semantic_caches_query_hash_idx" ON "semantic_caches"("query_hash");
