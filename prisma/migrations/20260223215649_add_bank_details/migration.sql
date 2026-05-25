-- CreateTable
CREATE TABLE "bank_details" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "iban" TEXT,
    "account_number" TEXT,
    "bank_name" TEXT NOT NULL,
    "swift_bic" TEXT,
    "sort_code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_details_user_id_key" ON "bank_details"("user_id");

-- CreateIndex
CREATE INDEX "bank_details_tenant_id_idx" ON "bank_details"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_details_tenant_id_user_id_key" ON "bank_details"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "bank_details" ADD CONSTRAINT "bank_details_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_details" ADD CONSTRAINT "bank_details_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
