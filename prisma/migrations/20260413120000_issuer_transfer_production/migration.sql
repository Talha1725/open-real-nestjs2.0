-- Issuer transfer flow: statuses, initiation, invitations, checklist, queue fields

-- New enums
CREATE TYPE "TransferInitiationType" AS ENUM ('KNOWN_BUYER', 'ISSUER_MANAGED');

CREATE TYPE "TransferInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

CREATE TYPE "TransferChecklistItemStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WAIVED');

-- Extend TransferCaseStatus (append-only; existing ordinals unchanged)
ALTER TYPE "TransferCaseStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'BUYER_SELECTED';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'BUYER_VERIFICATION_PENDING';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'COMPLIANCE_REVIEW';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'REGISTER_UPDATE_IN_PROGRESS';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'REJECTED';
ALTER TYPE "TransferCaseStatus" ADD VALUE 'EXPIRED';

-- TransferCase columns
ALTER TABLE "transfer_cases" ADD COLUMN "initiation_type" "TransferInitiationType" NOT NULL DEFAULT 'ISSUER_MANAGED';
ALTER TABLE "transfer_cases" ADD COLUMN "due_at" TIMESTAMP(3);
ALTER TABLE "transfer_cases" ADD COLUMN "assigned_to_user_id" TEXT;
ALTER TABLE "transfer_cases" ADD COLUMN "rejected_reason" TEXT;

ALTER TABLE "transfer_cases" ADD CONSTRAINT "transfer_cases_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transfer_cases_assigned_to_user_id_idx" ON "transfer_cases"("assigned_to_user_id");
CREATE INDEX "transfer_cases_due_at_idx" ON "transfer_cases"("due_at");

-- Normalize legacy in-flight rows: FINALIZING -> REGISTER_UPDATE_IN_PROGRESS
UPDATE "transfer_cases" SET "status" = 'REGISTER_UPDATE_IN_PROGRESS' WHERE "status" = 'FINALIZING';

-- Checklist
CREATE TABLE "transfer_checklist_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_case_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "TransferChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transfer_checklist_items_tenant_id_idx" ON "transfer_checklist_items"("tenant_id");
CREATE INDEX "transfer_checklist_items_transfer_case_id_idx" ON "transfer_checklist_items"("transfer_case_id");

ALTER TABLE "transfer_checklist_items" ADD CONSTRAINT "transfer_checklist_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_checklist_items" ADD CONSTRAINT "transfer_checklist_items_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invitations
CREATE TABLE "transfer_invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_case_id" TEXT NOT NULL,
    "invited_email" TEXT NOT NULL,
    "invited_user_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "status" "TransferInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transfer_invitations_tenant_id_idx" ON "transfer_invitations"("tenant_id");
CREATE INDEX "transfer_invitations_transfer_case_id_idx" ON "transfer_invitations"("transfer_case_id");
CREATE INDEX "transfer_invitations_invited_email_idx" ON "transfer_invitations"("invited_email");
CREATE INDEX "transfer_invitations_invited_user_id_idx" ON "transfer_invitations"("invited_user_id");
CREATE INDEX "transfer_invitations_token_hash_idx" ON "transfer_invitations"("token_hash");

ALTER TABLE "transfer_invitations" ADD CONSTRAINT "transfer_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_invitations" ADD CONSTRAINT "transfer_invitations_transfer_case_id_fkey" FOREIGN KEY ("transfer_case_id") REFERENCES "transfer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transfer_invitations" ADD CONSTRAINT "transfer_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
