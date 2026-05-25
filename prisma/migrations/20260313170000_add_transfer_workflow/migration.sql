-- CreateEnum
CREATE TYPE "TransferCaseStatus" AS ENUM ('DRAFT', 'RULES_CHECK', 'MANAGER_REVIEW', 'PRIORITY_WINDOW', 'KYC_READY', 'DOCS_PENDING', 'PAYMENT_PENDING', 'FINALIZING', 'COMPLETED', 'CANCELLED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "PriorityNoticeStatus" AS ENUM ('PENDING', 'EXERCISED', 'WAIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TokenRecordStatus" AS ENUM ('SHADOW_MIRROR', 'PENDING_SYNC', 'SYNCED', 'FAILED');

-- AlterTable: add transfer workflow columns to opportunities
ALTER TABLE "opportunities"
  ADD COLUMN "transfer_request_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lockup_until" TIMESTAMP(3),
  ADD COLUMN "min_transfer_quantity" DECIMAL(65,30),
  ADD COLUMN "max_holders" INTEGER,
  ADD COLUMN "rofr_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "rofr_window_days" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "transfer_cases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "buyer_id" TEXT,
    "holding_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "proposed_price" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "TransferCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "rules_result" JSONB,
    "priority_window_expires_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "payment_confirmed_at" TIMESTAMP(3),
    "payment_confirmed_by" TEXT,
    "registry_mutated_at" TIMESTAMP(3),
    "registry_mutated_by" TEXT,
    "admin_notes" TEXT,
    "cancelled_reason" TEXT,
    "escalated_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_status_histories" (
    "id" TEXT NOT NULL,
    "transfer_case_id" TEXT NOT NULL,
    "fromStatus" "TransferCaseStatus",
    "toStatus" "TransferCaseStatus" NOT NULL,
    "actor_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_notices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_case_id" TEXT NOT NULL,
    "holder_id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "status" "PriorityNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "priority_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_case_id" TEXT,
    "opportunity_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "event_type" TEXT NOT NULL,
    "sealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealed_by" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_case_id" TEXT,
    "holding_id" TEXT NOT NULL,
    "token_state" "TokenRecordStatus" NOT NULL DEFAULT 'SHADOW_MIRROR',
    "contract_address" TEXT,
    "token_id" TEXT,
    "sync_payload" JSONB,
    "synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfer_cases_reference_key" ON "transfer_cases"("reference");

-- CreateIndex
CREATE INDEX "transfer_cases_tenant_id_idx" ON "transfer_cases"("tenant_id");

-- CreateIndex
CREATE INDEX "transfer_cases_seller_id_idx" ON "transfer_cases"("seller_id");

-- CreateIndex
CREATE INDEX "transfer_cases_buyer_id_idx" ON "transfer_cases"("buyer_id");

-- CreateIndex
CREATE INDEX "transfer_cases_opportunity_id_idx" ON "transfer_cases"("opportunity_id");

-- CreateIndex
CREATE INDEX "transfer_cases_status_idx" ON "transfer_cases"("status");

-- CreateIndex
CREATE INDEX "transfer_status_histories_transfer_case_id_idx" ON "transfer_status_histories"("transfer_case_id");

-- CreateIndex
CREATE INDEX "priority_notices_tenant_id_idx" ON "priority_notices"("tenant_id");

-- CreateIndex
CREATE INDEX "priority_notices_transfer_case_id_idx" ON "priority_notices"("transfer_case_id");

-- CreateIndex
CREATE INDEX "priority_notices_holder_id_idx" ON "priority_notices"("holder_id");

-- CreateIndex
CREATE INDEX "registry_entries_tenant_id_idx" ON "registry_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "registry_entries_opportunity_id_idx" ON "registry_entries"("opportunity_id");

-- CreateIndex
CREATE INDEX "registry_entries_to_user_id_idx" ON "registry_entries"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_records_transfer_case_id_key" ON "token_records"("transfer_case_id");

-- CreateIndex
CREATE INDEX "token_records_tenant_id_idx" ON "token_records"("tenant_id");

-- CreateIndex
CREATE INDEX "token_records_holding_id_idx" ON "token_records"("holding_id");

-- AddForeignKey
ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_status_histories" ADD CONSTRAINT "transfer_status_histories_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_notices" ADD CONSTRAINT "priority_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_notices" ADD CONSTRAINT "priority_notices_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_notices" ADD CONSTRAINT "priority_notices_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_notices" ADD CONSTRAINT "priority_notices_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_records" ADD CONSTRAINT "token_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_records" ADD CONSTRAINT "token_records_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_records" ADD CONSTRAINT "token_records_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability trigger for registry_entries
CREATE OR REPLACE FUNCTION prevent_registry_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'registry_entries rows are immutable — UPDATE and DELETE are not allowed';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registry_entries_immutable
  BEFORE UPDATE OR DELETE ON "registry_entries"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_registry_entry_mutation();
