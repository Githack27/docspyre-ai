-- CreateTable
CREATE TABLE "provider_configs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "encrypted_prompt" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_configs_user_id_idx" ON "provider_configs"("user_id");

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
