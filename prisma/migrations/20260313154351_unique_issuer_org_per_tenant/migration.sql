-- AlterTable
CREATE UNIQUE INDEX "issuer_orgs_tenant_id_representative_user_id_key" ON "issuer_orgs"("tenant_id", "representative_user_id");
